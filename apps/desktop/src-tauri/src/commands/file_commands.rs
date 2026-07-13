use crate::error::AppError;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub async fn select_files() -> Result<Vec<String>, AppError> {
    let files = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .add_filter("Images", &["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp"])
        .add_filter("PDF", &["pdf"])
        .add_filter("All Supported", &["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp", "pdf"])
        .pick_files();

    match files {
        Some(paths) => Ok(paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect()),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, AppError> {
    let folder = tauri::api::dialog::blocking::FileDialogBuilder::new().pick_folder();
    match folder {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn select_output_file() -> Result<Option<String>, AppError> {
    let file = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .add_filter("Excel Files", &["xlsx"])
        .set_file_name("guestfill_export.xlsx")
        .save_file();

    match file {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn pick_image_file() -> Result<Option<String>, AppError> {
    let file = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .add_filter("Images", &["jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"])
        .pick_file();
    match file {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn read_image_base64(path: String) -> Result<String, AppError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", "Image file does not exist"));
    }
    let data = std::fs::read(path).map_err(|e| {
        AppError::with_technical("READ_FAILED", "Failed to read image file", e.to_string())
    })?;

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("jpg").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "tiff" | "tif" => "image/tiff",
        _ => "image/jpeg",
    };

    let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:{};base64,{}", mime, base64))
}

#[tauri::command]
pub async fn open_file(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", "File does not exist"));
    }
    let path_str = path.to_str().unwrap_or("");
    tauri::api::shell::open(&app.shell_scope(), path_str, None).map_err(|e| {
        AppError::with_technical("OPEN_FAILED", "Failed to open file", e.to_string())
    })
}

#[tauri::command]
pub async fn open_folder(path: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(AppError::new("FOLDER_NOT_FOUND", "Folder does not exist"));
    }
    let path_str = path.to_str().unwrap_or("");
    tauri::api::shell::open(&app.shell_scope(), path_str, None).map_err(|e| {
        AppError::with_technical("OPEN_FAILED", "Failed to open folder", e.to_string())
    })
}
