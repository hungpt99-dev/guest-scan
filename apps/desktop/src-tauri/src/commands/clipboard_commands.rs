use crate::error::AppError;

#[tauri::command]
pub async fn copy_to_clipboard(text: String) -> Result<(), AppError> {
    let result = tauri::api::clipboard::write_text(text);
    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(AppError::with_technical(
            "CLIPBOARD_COPY_FAILED",
            "Could not copy text to clipboard",
            e.to_string(),
        )),
    }
}
