use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPayload {
    pub url: String,
    pub prefix_path: String,
    pub anti_paths: Vec<String>,
    pub anti_keywords: Vec<String>,
    pub skip_processed: bool,
    pub url_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCompletedResult {
    pub snippets_count: Option<usize>,
    pub url_id: Uuid,
}

// Task event types
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreatedEvent {
    pub task_id: String,
    pub task_type: String,
    pub metadata: TaskPayload,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdatedEvent {
    pub task_id: String,
    pub progress: i32,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskCompletedEvent {
    pub task_id: String,
    pub result: TaskCompletedResult,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskFailedEvent {
    pub task_id: String,
    pub error: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskCancelledEvent {
    pub task_id: String,
}

// Processing event types
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingStartedEvent {
    pub task_id: String,
    pub url: Option<String>,
    pub tech_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingProgressEvent {
    pub task_id: String,
    pub stage: String,
    pub progress: f32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingCompletedEvent {
    pub task_id: String,
    pub snippets_count: i32,
}

// URL event types
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UrlStatusUpdatedEvent {
    pub url_id: String,
    pub status: String,
}


#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppNotificationEvent {
    pub title: String,
    pub message: String,
    pub notification_type: Option<String>,
}

/// EventEmitter for sending events from backend to frontend
#[derive(Debug, Clone)]
pub struct EventEmitter {
    app_handle: AppHandle,
}

impl EventEmitter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    // Task events
    pub fn emit_task_created(
        &self,
        task_id: &str,
        task_type: &str,
        metadata: TaskPayload,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:created",
            TaskCreatedEvent {
                task_id: task_id.to_string(),
                task_type: task_type.to_string(),
                metadata,
            },
        )
    }

    pub fn emit_task_updated(
        &self,
        task_id: &str,
        progress: i32,
        status: &str,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:updated",
            TaskUpdatedEvent {
                task_id: task_id.to_string(),
                progress,
                status: status.to_string(),
            },
        )
    }

    pub fn emit_task_completed(
        &self,
        task_id: &str,
        result: TaskCompletedResult,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:completed",
            TaskCompletedEvent {
                task_id: task_id.to_string(),
                result,
            },
        )
    }

    pub fn emit_task_failed(&self, task_id: &str, error: &str) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:failed",
            TaskFailedEvent {
                task_id: task_id.to_string(),
                error: error.to_string(),
            },
        )
    }

    pub fn emit_task_error(&self, task_id: &str, error: &str) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:error",
            TaskFailedEvent {
                task_id: task_id.to_string(),
                error: error.to_string(),
            },
        )
    }

    pub fn emit_task_cancelled(&self, task_id: &str) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "task:cancelled",
            TaskCancelledEvent {
                task_id: task_id.to_string(),
            },
        )
    }

    // Processing events
    pub fn emit_processing_started(
        &self,
        task_id: &str,
        url: Option<&str>,
        tech_id: Option<&Uuid>,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "processing:started",
            ProcessingStartedEvent {
                task_id: task_id.to_string(),
                url: url.map(|s| s.to_string()),
                tech_id: tech_id.map(|id| id.to_string()),
            },
        )
    }

    pub fn emit_processing_progress(
        &self,
        task_id: &str,
        stage: &str,
        progress: f32,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "processing:progress",
            ProcessingProgressEvent {
                task_id: task_id.to_string(),
                stage: stage.to_string(),
                progress,
            },
        )
    }

    pub fn emit_processing_completed(
        &self,
        task_id: &str,
        snippets_count: i32,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "processing:completed",
            ProcessingCompletedEvent {
                task_id: task_id.to_string(),
                snippets_count,
            },
        )
    }

    // URL events
    pub fn emit_url_status_updated(&self, url_id: &Uuid, status: &str) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "url:status:updated",
            UrlStatusUpdatedEvent {
                url_id: url_id.to_string(),
                status: status.to_string(),
            },
        )
    }

    pub fn emit_app_notification(
        &self,
        title: &str,
        message: &str,
        notification_type: Option<&str>,
    ) -> Result<(), tauri::Error> {
        self.app_handle.emit(
            "app:notification",
            AppNotificationEvent {
                title: title.to_string(),
                message: message.to_string(),
                notification_type: notification_type.map(|t| t.to_string()),
            },
        )
    }
}
