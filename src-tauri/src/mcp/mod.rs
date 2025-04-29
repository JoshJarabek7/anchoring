use crate::db::models::TechnologyVersion;
use crate::services::get_services;
use mcp_core::server::Server;
use mcp_core::tool_error_response;
use mcp_core::tool_text_response;
use mcp_core::transport::ServerSseTransport;
use mcp_core::types::{
    CallToolRequest, CallToolResponse, ServerCapabilities, Tool, ToolResponseContent,
};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::future::Future;
use std::pin::Pin;
use tokio::sync::broadcast;

// Global shutdown channel
static SHUTDOWN_CHANNEL: once_cell::sync::Lazy<(broadcast::Sender<()>, broadcast::Receiver<()>)> =
    once_cell::sync::Lazy::new(|| broadcast::channel(1));

/// Main entry point to start the MCP server
pub fn start_server(port: u16) -> Result<(), String> {
    // Set RUST_LOG for detailed logging if not already set
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "debug,mcp_core=trace");
    }

    println!("[MCP] Setting up MCP server tools...");

    // Build the server with the tools
    let server_protocol = Server::builder("Anchoring MCP Server".to_string(), "1.0.0".to_string())
        .capabilities(ServerCapabilities {
            tools: Some(serde_json::json!({
                "listChanged": false,
            })),
            ..Default::default()
        })
        .register_tool(list_technologies_tool(), list_technologies_handler)
        .register_tool(vector_search_tool(), vector_search_handler)
        .build();

    println!("[MCP] Configured server with tools: list_technologies, vector_search");

    // Set up the transport
    let uri = format!("http://localhost:{}", port);
    println!("[MCP] Server will listen on URI: {}", uri);
    println!("[MCP] Make sure your client is connecting to: {}", uri);

    // Create the SSE transport
    let transport = ServerSseTransport::new("127.0.0.1".to_string(), port, server_protocol);
    println!("[MCP] Created SSE transport on port {}", port);

    // Log that we're starting the server
    println!("[MCP] Starting Model Context Protocol server");
    println!("[MCP] Registered tools: list_technologies, vector_search");

    // Get a receiver for the shutdown signal
    let mut shutdown_rx = SHUTDOWN_CHANNEL.0.subscribe();

    // Start the server in a separate thread
    std::thread::Builder::new()
        .name("mcp-server".to_string())
        .spawn(move || {
            let runtime = tokio::runtime::Runtime::new().unwrap();
            runtime.block_on(async {
                println!("[MCP] Server thread started");
                tokio::select! {
                    _ = Server::start(transport) => {
                        println!("[MCP] Server completed");
                    }
                    _ = shutdown_rx.recv() => {
                        println!("[MCP] Shutdown signal received");
                    }
                }
            });
        })
        .unwrap();

    println!("[MCP] Server initialized successfully");
    Ok(())
}

/// Shutdown the MCP server gracefully
pub fn shutdown_server() {
    println!("[MCP] Initiating server shutdown...");
    if let Err(e) = SHUTDOWN_CHANNEL.0.send(()) {
        eprintln!("[MCP] Error sending shutdown signal: {}", e);
    }
}

// Schema definitions for list_technologies tool
#[derive(Serialize, Deserialize)]
struct ListTechnologiesRequest {}

#[derive(Serialize, Deserialize)]
struct TechnologyInfo {
    name: String,
    language: Option<String>,
    versions: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct ListTechnologiesResponse {
    technologies: Vec<TechnologyInfo>,
}

// Schema definitions for vector_search tool
#[derive(Serialize, Deserialize)]
struct VectorSearchRequest {
    code_context: Option<Vec<String>>,
    query: String,
    technology_name: String,
    technology_version: Option<String>,
    n: Option<usize>,
    next_closest: Option<bool>,
    resolve_upwards: Option<bool>,
}

#[derive(Serialize, Deserialize)]
struct SnippetInfo {
    id: String,
    title: String,
    description: String,
    content: String,
    source_url: String,
    similarity: f32,
}

#[derive(Serialize, Deserialize)]
struct VectorSearchResponse {
    snippets: Vec<SnippetInfo>,
    technology_name: String,
    technology_version: String,
    total_results: usize,
}

/// Tool definition for list_technologies
fn list_technologies_tool() -> Tool {
    println!("[MCP] Creating list_technologies tool definition");
    Tool {
        name: "list_technologies".to_string(),
        description: Some("List all available technologies and their versions".to_string()),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {},
            "required": []
        }),
        annotations: None,
    }
}

/// Tool definition for vector_search
fn vector_search_tool() -> Tool {
    println!("[MCP] Creating vector_search tool definition");
    Tool {
        name: "vector_search".to_string(),
        description: Some("Search for documentation snippets related to a query".to_string()),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "code_context": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "List of string snippets of relevant code in the user's codebase that's relevant to the query (Optional)"
                },
                "query": {
                    "type": "string",
                    "description": "Search/question query that serves as the basis for the search"
                },
                "technology_name": {
                    "type": "string",
                    "description": "Name of the technology applicable / the name of the technology you want the snippets for"
                },
                "technology_version": {
                    "type": "string",
                    "description": "Version of the technology, should be the same as the version in the user's environment (Optional)"
                },
                "n": {
                    "type": "integer",
                    "description": "Maximum number of snippets to fetch (Optional, defaults to 10)"
                },
                "next_closest": {
                    "type": "boolean",
                    "description": "Whether to search for the next closest technology version if the specific version is not available (Optional)"
                },
                "resolve_upwards": {
                    "type": "boolean",
                    "description": "If the distance is the same for lower and higher values, choose the higher version (Optional, defaults to true)"
                }
            },
            "required": ["query", "technology_name"]
        }),
        annotations: None,
    }
}

/// Handler function for list_technologies tool
fn list_technologies_handler(
    request: CallToolRequest,
) -> Pin<Box<dyn Future<Output = CallToolResponse> + Send>> {
    println!(
        "[MCP] list_technologies tool called with params: {:?}",
        request
    );

    Box::pin(async move {
        let json_value = match request.arguments {
            Some(args) => serde_json::to_value(args).unwrap_or(serde_json::Value::Null),
            None => serde_json::Value::Null,
        };

        match handle_list_technologies(json_value).await {
            Ok(result) => {
                println!("[MCP] list_technologies succeeded, returning result");
                let response_text = match serde_json::to_string(&result) {
                    Ok(text) => text,
                    Err(e) => {
                        return tool_error_response!(format!("Failed to serialize response: {}", e))
                    }
                };
                tool_text_response!(response_text)
            }
            Err(e) => {
                println!("[MCP] list_technologies failed with error: {}", e);
                tool_error_response!(format!("List technologies error: {}", e))
            }
        }
    })
}

/// Handler function for vector_search tool
fn vector_search_handler(
    request: CallToolRequest,
) -> Pin<Box<dyn Future<Output = CallToolResponse> + Send>> {
    println!("[MCP] vector_search tool called with params: {:?}", request);

    Box::pin(async move {
        let json_value = match request.arguments {
            Some(args) => serde_json::to_value(args).unwrap_or(serde_json::Value::Null),
            None => serde_json::Value::Null,
        };

        match handle_vector_search(json_value).await {
            Ok(result) => {
                println!("[MCP] vector_search succeeded, returning result");
                let response_text = match serde_json::to_string(&result) {
                    Ok(text) => text,
                    Err(e) => {
                        return tool_error_response!(format!("Failed to serialize response: {}", e))
                    }
                };
                tool_text_response!(response_text)
            }
            Err(e) => {
                println!("[MCP] vector_search failed with error: {}", e);
                tool_error_response!(format!("Vector search error: {}", e))
            }
        }
    })
}

/// Handler function for list_technologies tool
async fn handle_list_technologies(params: serde_json::Value) -> Result<serde_json::Value, String> {
    println!("[MCP] Handling list_technologies with params: {:?}", params);

    // Get all technologies
    let services = get_services();
    println!("[MCP] Got services reference");

    let technologies = match services.technologies.get_technologies().await {
        Ok(techs) => {
            println!("[MCP] Successfully fetched {} technologies", techs.len());
            techs
        }
        Err(e) => {
            println!("[MCP] Error fetching technologies: {}", e);
            return Err(format!("Error fetching technologies: {}", e));
        }
    };

    let mut tech_info_list = Vec::new();

    // For each technology, get its versions
    for tech in technologies {
        println!("[MCP] Processing technology: {}", tech.name);
        let versions = match services.versions.get_versions_for_technology(tech.id).await {
            Ok(vers) => {
                println!(
                    "[MCP] Successfully fetched {} versions for {}",
                    vers.len(),
                    tech.name
                );
                vers
            }
            Err(e) => {
                println!("[MCP] Error fetching versions for {}: {}", tech.name, e);
                return Err(format!("Error fetching versions for {}: {}", tech.name, e));
            }
        };

        let version_strings = versions.iter().map(|v| v.version.clone()).collect();

        tech_info_list.push(TechnologyInfo {
            name: tech.name,
            language: tech.language,
            versions: version_strings,
        });
    }

    let response = ListTechnologiesResponse {
        technologies: tech_info_list,
    };

    println!(
        "[MCP] Creating response with {} technologies",
        response.technologies.len()
    );

    match serde_json::to_value(response) {
        Ok(json_response) => {
            println!(
                "[MCP] Successfully serialized response: {}",
                if json_response.to_string().len() > 100 {
                    format!("{}... (truncated)", &json_response.to_string()[..100])
                } else {
                    json_response.to_string()
                }
            );
            Ok(json_response)
        }
        Err(e) => {
            println!("[MCP] Error serializing response: {}", e);
            Err(format!("Error serializing response: {}", e))
        }
    }
}

/// Handler function for vector_search tool
async fn handle_vector_search(params: serde_json::Value) -> Result<serde_json::Value, String> {
    println!("[MCP] Handling vector_search with params: {:?}", params);

    // Parse request parameters
    let request: VectorSearchRequest =
        match serde_json::from_value::<VectorSearchRequest>(params.clone()) {
            Ok(req) => {
                println!(
                    "[MCP] Successfully parsed vector_search request for technology: {}",
                    req.technology_name
                );
                req
            }
            Err(e) => {
                println!("[MCP] Error parsing vector_search parameters: {}", e);
                return Err(format!("Invalid parameters: {}", e));
            }
        };

    let services = get_services();

    // Find the technology by name
    let technologies = match services.technologies.get_technologies().await {
        Ok(techs) => {
            println!("[MCP] Successfully fetched {} technologies", techs.len());
            techs
        }
        Err(e) => {
            println!("[MCP] Error fetching technologies: {}", e);
            return Err(format!("Error fetching technologies: {}", e));
        }
    };

    let technology = match technologies
        .iter()
        .find(|t| t.name.to_lowercase() == request.technology_name.to_lowercase())
    {
        Some(tech) => {
            println!("[MCP] Found technology: {}", tech.name);
            tech
        }
        None => {
            println!("[MCP] Technology '{}' not found", request.technology_name);
            return Err(format!(
                "Technology '{}' not found",
                request.technology_name
            ));
        }
    };

    // Get all versions for this technology
    let versions = match services
        .versions
        .get_versions_for_technology(technology.id)
        .await
    {
        Ok(vers) => {
            println!(
                "[MCP] Successfully fetched {} versions for {}",
                vers.len(),
                technology.name
            );
            vers
        }
        Err(e) => {
            println!(
                "[MCP] Error fetching versions for {}: {}",
                technology.name, e
            );
            return Err(format!("Error fetching versions: {}", e));
        }
    };

    if versions.is_empty() {
        println!(
            "[MCP] No versions found for technology '{}'",
            request.technology_name
        );
        return Err(format!(
            "No versions found for technology '{}'",
            request.technology_name
        ));
    }

    // Find the requested version or closest available
    let version = if let Some(requested_version) = &request.technology_version {
        println!("[MCP] Looking for specific version: {}", requested_version);
        // Find exact version
        let exact_match = versions.iter().find(|v| v.version == *requested_version);

        if let Some(v) = exact_match {
            println!("[MCP] Found exact version match: {}", v.version);
            v.clone()
        } else if request.next_closest.unwrap_or(true) {
            println!(
                "[MCP] No exact match, looking for closest version to {}",
                requested_version
            );
            // Find closest version if exact match not found
            match find_closest_version(
                &versions,
                requested_version,
                request.resolve_upwards.unwrap_or(true),
            ) {
                Some(v) => {
                    println!("[MCP] Found closest version: {}", v.version);
                    v
                }
                None => {
                    println!(
                        "[MCP] No suitable version found for technology '{}' version '{}'",
                        request.technology_name, requested_version
                    );
                    return Err(format!(
                        "No suitable version found for technology '{}' version '{}'",
                        request.technology_name, requested_version
                    ));
                }
            }
        } else {
            println!(
                "[MCP] Version '{}' not found for technology '{}' and next_closest=false",
                requested_version, request.technology_name
            );
            return Err(format!(
                "Version '{}' not found for technology '{}'",
                requested_version, request.technology_name
            ));
        }
    } else {
        println!("[MCP] No specific version requested, using latest");
        // No specific version requested, use the latest
        match versions
            .iter()
            .max_by(|a, b| version_compare(&a.version, &b.version))
        {
            Some(v) => {
                println!("[MCP] Using latest version: {}", v.version);
                v.clone()
            }
            None => {
                println!(
                    "[MCP] No versions found for technology '{}'",
                    request.technology_name
                );
                return Err(format!(
                    "No versions found for technology '{}'",
                    request.technology_name
                ));
            }
        }
    };

    // Use the query to perform vector search
    let query = if let Some(contexts) = &request.code_context {
        // Combine code context with query
        let context_text = contexts.join("\n\n");
        println!(
            "[MCP] Using query with code context, total length: {}",
            context_text.len() + request.query.len()
        );
        format!("{}\n\nQuery: {}", context_text, request.query)
    } else {
        println!("[MCP] Using raw query: {}", request.query);
        request.query
    };

    // Determine number of results to fetch
    let limit = request.n.unwrap_or(10);
    println!("[MCP] Using limit of {} results", limit);
    let pagination = crate::db::repositories::PaginationParams {
        page: 1,
        per_page: limit as i64,
    };

    // Search for snippets
    println!(
        "[MCP] Performing vector search for version_id: {}",
        version.id
    );
    let search_results = match services
        .documentation
        .search_snippets_by_vector(
            &query,
            Some(pagination),
            None, // No filter
            Some(&version.id),
        )
        .await
    {
        Ok(results) => {
            println!(
                "[MCP] Vector search successful, found {} results",
                results.results.len()
            );
            results
        }
        Err(e) => {
            println!("[MCP] Error searching snippets: {}", e);
            return Err(format!("Error searching snippets: {}", e));
        }
    };

    // Convert results to response format
    let snippets = search_results
        .results
        .into_iter()
        .map(|r| SnippetInfo {
            id: r.id,
            title: r.title,
            description: r.description,
            content: r.content,
            source_url: r.source_url,
            similarity: r.similarity,
        })
        .collect();

    let response = VectorSearchResponse {
        snippets,
        technology_name: technology.name.clone(),
        technology_version: version.version.clone(),
        total_results: search_results.total_count as usize,
    };

    println!(
        "[MCP] Creating response with {} snippets",
        response.snippets.len()
    );

    match serde_json::to_value(response) {
        Ok(json_response) => {
            println!(
                "[MCP] Successfully serialized response (length: {})",
                json_response.to_string().len()
            );
            Ok(json_response)
        }
        Err(e) => {
            println!("[MCP] Error serializing response: {}", e);
            Err(format!("Error serializing response: {}", e))
        }
    }
}

/// Compare two version strings, supporting semver-like formats
/// Returns Ordering for proper sorting
fn version_compare(v1: &str, v2: &str) -> Ordering {
    // Simple semver-like comparison
    let parts1: Vec<&str> = v1.split('.').collect();
    let parts2: Vec<&str> = v2.split('.').collect();

    for i in 0..std::cmp::max(parts1.len(), parts2.len()) {
        let num1 = parts1
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let num2 = parts2
            .get(i)
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        match num1.cmp(&num2) {
            Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    Ordering::Equal
}

/// Find closest version to target in a list of versions
fn find_closest_version(
    versions: &[TechnologyVersion],
    target: &str,
    resolve_upwards: bool,
) -> Option<TechnologyVersion> {
    if versions.is_empty() {
        return None;
    }

    // Parse the target version
    let target_parts: Vec<u32> = target
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect();

    // Find the closest version
    let mut best_match = None;
    let mut smallest_diff = u32::MAX;

    for version in versions {
        // Parse this version
        let version_parts: Vec<u32> = version
            .version
            .split('.')
            .map(|part| part.parse::<u32>().unwrap_or(0))
            .collect();

        // Calculate version difference score (lower is closer)
        let mut diff = 0;
        let max_parts = std::cmp::max(target_parts.len(), version_parts.len());

        for i in 0..max_parts {
            let target_part = target_parts.get(i).copied().unwrap_or(0);
            let version_part = version_parts.get(i).copied().unwrap_or(0);

            // Higher parts have more weight in the difference
            let weight = 10u32.pow((max_parts - i - 1) as u32);
            diff += weight * target_part.abs_diff(version_part);
        }

        // Check if this is a better match
        if diff < smallest_diff {
            smallest_diff = diff;
            best_match = Some(version.clone());
        } else if diff == smallest_diff {
            // Same difference, use resolve_upwards to choose
            if let Some(current_best) = &best_match {
                let current_is_newer =
                    version_compare(&version.version, &current_best.version) == Ordering::Greater;

                if (resolve_upwards && current_is_newer) || (!resolve_upwards && !current_is_newer)
                {
                    best_match = Some(version.clone());
                }
            }
        }
    }

    best_match
}
