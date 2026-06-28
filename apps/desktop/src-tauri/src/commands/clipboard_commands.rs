use crate::error::AppError;
use tauri::ClipboardManager;

#[tauri::command]
pub async fn copy_to_clipboard(text: String, app: tauri::AppHandle) -> Result<(), AppError> {
    app.clipboard_manager()
        .write_text(text)
        .map_err(|e| {
            AppError::with_technical(
                "CLIPBOARD_COPY_FAILED",
                "Could not copy text to clipboard",
                e.to_string(),
            )
        })
}
