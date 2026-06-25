use crate::error::AppError;
use std::fs;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct ExcelImportResult {
    pub rows: Vec<serde_json::Value>,
    pub errors: Vec<AppError>,
    pub total_rows: u32,
    pub valid_rows: u32,
}

#[tauri::command]
pub async fn read_excel_file(path: String) -> Result<Vec<u8>, AppError> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(AppError::new("EXCEL_FILE_NOT_FOUND", "Excel file not found"));
    }
    fs::read(file_path).map_err(|e| {
        AppError::with_technical("EXCEL_READ_FAILED", "Failed to read Excel file", e.to_string())
    })
}

#[tauri::command]
pub async fn export_excel_placeholder() -> Result<(), AppError> {
    Ok(())
}

#[tauri::command]
pub async fn import_excel_placeholder() -> Result<ExcelImportResult, AppError> {
    Ok(ExcelImportResult {
        rows: Vec::new(),
        errors: Vec::new(),
        total_rows: 0,
        valid_rows: 0,
    })
}
