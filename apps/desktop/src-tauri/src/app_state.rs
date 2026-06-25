use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ocr_worker_path: String,
    pub ocr_language: String,
    pub output_directory: String,
    pub temp_directory: String,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ocr_worker_path: String::new(),
            ocr_language: "eng".to_string(),
            output_directory: String::new(),
            temp_directory: String::new(),
            theme: "light".to_string(),
        }
    }
}

pub struct AppState {
    pub settings: std::sync::Mutex<AppSettings>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: std::sync::Mutex::new(AppSettings::default()),
        }
    }
}
