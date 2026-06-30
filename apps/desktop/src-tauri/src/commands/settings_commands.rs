use crate::error::AppError;
use crate::app_state::AppSettings;
use tauri::State;

#[tauri::command]
pub async fn load_settings(
    state: State<'_, crate::app_state::AppState>,
) -> Result<AppSettings, AppError> {
    let settings = state.settings.lock().map_err(|_| {
        AppError::new("LOCK_ERROR", "Failed to read settings")
    })?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, crate::app_state::AppState>,
    settings: AppSettings,
) -> Result<(), AppError> {
    let mut current = state.settings.lock().map_err(|_| {
        AppError::new("LOCK_ERROR", "Failed to write settings")
    })?;
    *current = settings;
    Ok(())
}
