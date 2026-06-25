use crate::error::AppError;
use tauri::Manager;

#[tauri::command]
pub async fn select_files() -> Result<Vec<String>, AppError> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
pub async fn select_output_file() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
pub async fn open_file(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", "File does not exist"));
    }
    tauri::api::shell::open(&app.shell_scope(), &path, None).map_err(|e| {
        AppError::with_technical("OPEN_FAILED", "Failed to open file", e.to_string())
    })
}

#[tauri::command]
pub async fn open_folder(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Err(AppError::new("FOLDER_NOT_FOUND", "Folder does not exist"));
    }
    tauri::api::shell::open(&app.shell_scope(), &path, None).map_err(|e| {
        AppError::with_technical("OPEN_FAILED", "Failed to open folder", e.to_string())
    })
}
