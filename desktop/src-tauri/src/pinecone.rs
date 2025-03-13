use pinecone_sdk::pinecone::{PineconeClient, PineconeClientConfig};
use pinecone_sdk::models::{Vector, Namespace, Metadata, Value, Kind};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct PineconeConfig {
    pub api_key: String,
    pub index_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub content: String,
    pub embedding: Vec<f32>,
    pub metadata: serde_json::Value,
}

pub struct PineconeService {
    client: PineconeClient,
    index_name: String,
    index_host: String,
}

impl PineconeService {
    pub async fn new(config: PineconeConfig) -> Result<Self, Box<dyn Error>> {
        println!("🔍 [Pinecone] Initializing PineconeService with index: {}", config.index_name);
        println!("🔍 [Pinecone] API key (first 5 chars): {}", &config.api_key[..5.min(config.api_key.len())]);
        
        // Create client config with API key
        let client_config = PineconeClientConfig {
            api_key: Some(config.api_key.clone()),
            ..Default::default()
        };
        
        println!("🔍 [Pinecone] Creating Pinecone client with config");
        
        // Initialize the client
        let client = match client_config.client() {
            Ok(client) => {
                println!("✅ [Pinecone] Successfully created Pinecone client");
                client
            },
            Err(e) => {
                println!("❌ [Pinecone] Failed to create Pinecone client: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to create Pinecone client: {}", e))));
            }
        };
        
        // IMPORTANT: First describe the index to get its host
        println!("🔍 [Pinecone] Describing index to get host: {}", config.index_name);
        let index_description = match client.describe_index(&config.index_name).await {
            Ok(desc) => {
                println!("✅ [Pinecone] Successfully described index: {}", config.index_name);
                println!("🔍 [Pinecone] Index host: {}", desc.host);
                println!("🔍 [Pinecone] Index status: {:?}", desc.status);
                println!("🔍 [Pinecone] Index dimension: {}", desc.dimension);
                desc
            },
            Err(e) => {
                println!("❌ [Pinecone] Failed to describe index: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to describe index: {}", e))));
            }
        };
        
        Ok(Self {
            client,
            index_name: config.index_name,
            index_host: index_description.host,
        })
    }

    pub async fn add_documents(&self, documents: Vec<Document>) -> Result<(), Box<dyn Error>> {
        println!("🔍 [Pinecone] Adding {} documents to index: {}", documents.len(), self.index_name);
        
        // Log sample document (first one)
        if !documents.is_empty() {
            let sample = &documents[0];
            println!("🔍 [Pinecone] Sample document ID: {}", sample.id);
            println!("🔍 [Pinecone] Sample embedding length: {}", sample.embedding.len());
            println!("🔍 [Pinecone] Sample metadata: {}", serde_json::to_string(&sample.metadata).unwrap_or_else(|_| "Could not serialize".to_string()));
        }
        
        // Connect to the index using the HOST, not the name
        println!("🔍 [Pinecone] Connecting to index using host: {}", self.index_host);
        let mut index = match self.client.index(&self.index_host).await {
            Ok(index) => {
                println!("✅ [Pinecone] Successfully connected to index");
                index
            },
            Err(e) => {
                println!("❌ [Pinecone] Failed to connect to index: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to connect to index: {}", e))));
            }
        };
        
        // Convert documents to vectors
        println!("🔍 [Pinecone] Converting documents to Pinecone vectors");
        let vectors: Vec<Vector> = documents
            .into_iter()
            .map(|doc| {
                // Convert serde_json::Value to Pinecone Metadata format
                let metadata = convert_json_to_metadata(doc.metadata.clone());
                
                println!("🔍 [Pinecone] Processing document ID: {}, embedding length: {}", 
                         doc.id, doc.embedding.len());
                
                Vector {
                    id: doc.id,
                    values: doc.embedding,
                    sparse_values: None,
                    metadata: Some(metadata),
                }
            })
            .collect();

        println!("🔍 [Pinecone] Upserting {} vectors to index", vectors.len());
        
        // Upsert vectors to the index - use default namespace
        match index.upsert(&vectors, &Namespace::default()).await {
            Ok(response) => {
                println!("✅ [Pinecone] Successfully upserted vectors. Upserted count: {}", response.upserted_count);
                Ok(())
            },
            Err(e) => {
                println!("❌ [Pinecone] Failed to upsert vectors: {}", e);
                Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to upsert vectors: {}", e))))
            }
        }
    }

    pub async fn search(
        &self,
        embedding: Vec<f32>,
        filter: Option<serde_json::Value>,
        limit: usize,
    ) -> Result<Vec<Vector>, Box<dyn Error>> {
        println!("🔍 [Pinecone] Searching index with embedding length: {}", embedding.len());
        
        // Connect to the index using the HOST, not the name
        let mut index = match self.client.index(&self.index_host).await {
            Ok(index) => {
                println!("✅ [Pinecone] Successfully connected to index");
                index
            },
            Err(e) => {
                println!("❌ [Pinecone] Failed to connect to index: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to connect to index: {}", e))));
            }
        };
        
        // Convert filter if provided
        let metadata_filter = filter.map(convert_json_to_metadata);
        
        // Query the index - use default namespace
        match index.query_by_value(
            embedding,
            None, // No sparse values
            limit as u32,
            &Namespace::default(),
            metadata_filter,
            Some(true), // Include values
            Some(true), // Include metadata
        ).await {
            Ok(response) => {
                println!("✅ [Pinecone] Search successful. Got {} matches", response.matches.len());
                
                // Convert matches to Vector objects and log metadata
                let vectors = response.matches
                    .into_iter()
                    .map(|m| {
                        if let Some(ref md) = m.metadata {
                            println!("🔍 [Pinecone] Match {} has metadata with {} fields", m.id, md.fields.len());
                        } else {
                            println!("🔍 [Pinecone] Match {} has no metadata", m.id);
                        }
                        Vector {
                            id: m.id,
                            values: m.values,
                            sparse_values: m.sparse_values,
                            metadata: m.metadata,
                        }
                    })
                    .collect();
                
                Ok(vectors)
            },
            Err(e) => {
                println!("❌ [Pinecone] Search failed: {}", e);
                Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, 
                    format!("Failed to search: {}", e))))
            }
        }
    }
}

// Helper function to convert serde_json::Value to Pinecone Metadata
fn convert_json_to_metadata(json: serde_json::Value) -> Metadata {
    let mut fields = BTreeMap::new();
    
    if let serde_json::Value::Object(map) = json {
        for (key, value) in map {
            let kind = match value {
                serde_json::Value::Object(obj) => {
                    // Handle Pinecone filter format: { field: { $eq: value } }
                    if let Some(eq_value) = obj.get("$eq") {
                        match eq_value {
                            serde_json::Value::String(s) => Some(Kind::StringValue(s.clone())),
                            serde_json::Value::Number(n) => {
                                if let Some(f) = n.as_f64() {
                                    Some(Kind::NumberValue(f))
                                } else {
                                    None
                                }
                            },
                            serde_json::Value::Bool(b) => Some(Kind::BoolValue(*b)),
                            _ => None,
                        }
                    } else {
                        // Convert object to string to preserve the data
                        Some(Kind::StringValue(serde_json::to_string(&obj).unwrap_or_default()))
                    }
                },
                serde_json::Value::String(s) => Some(Kind::StringValue(s)),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Some(Kind::NumberValue(i as f64))
                    } else if let Some(f) = n.as_f64() {
                        Some(Kind::NumberValue(f))
                    } else {
                        None
                    }
                },
                serde_json::Value::Bool(b) => Some(Kind::BoolValue(b)),
                serde_json::Value::Array(arr) => {
                    // Convert array to string to preserve the data
                    Some(Kind::StringValue(serde_json::to_string(&arr).unwrap_or_default()))
                },
                serde_json::Value::Null => None,
            };
            
            if let Some(k) = kind {
                // Clone the key and kind for logging since they will be moved into the BTreeMap
                let key_clone = key.clone();
                let k_clone = k.clone();
                fields.insert(key, Value { kind: Some(k) });
                println!("🔍 [Pinecone] Added metadata field: {} = {:?}", key_clone, k_clone);
            }
        }
    }
    
    Metadata { fields }
} 