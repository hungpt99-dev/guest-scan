use crate::error::AppError;
use crate::platform::create_platform_automation;
use std::time::Duration;
use tauri::ClipboardManager;

/// Focus a target application window by process name or window title.
///
/// Delegates to the platform-specific automation backend.
#[tauri::command]
pub async fn focus_app_window(
    window_title: Option<String>,
    process_name: Option<String>,
) -> Result<(), AppError> {
    let automation = create_platform_automation();
    automation.focus_app(window_title.as_deref(), process_name.as_deref())
}

/// Fill a value into a native desktop application field.
///
/// Delegates to the platform-specific automation backend to find the UI
/// element by its `accessibilityIdentifier` (macOS) or `AutomationId` (Windows)
/// and set its value.
#[tauri::command]
pub async fn fill_desktop_field(automation_id: String, value: String) -> Result<(), AppError> {
    let automation = create_platform_automation();
    automation.fill_desktop_field(&automation_id, &value)
}

/// Click a submit button in a desktop application.
///
/// Delegates to the platform-specific automation backend to find the
/// UI element by its `accessibilityIdentifier` (macOS) or `AutomationId`
/// (Windows) and perform a click action.
#[tauri::command]
pub async fn click_submit_button(automation_id: String) -> Result<(), AppError> {
    let automation = create_platform_automation();
    automation.click_submit(&automation_id)
}

/// Fill a value into a web browser form field.
///
/// Copies the value to the system clipboard, then simulates the platform's
/// paste keystroke (Cmd+V on macOS, Ctrl+V on Windows).
#[tauri::command]
pub async fn fill_web_field(_selector: String, value: String, app: tauri::AppHandle) -> Result<(), AppError> {
    app.clipboard_manager()
        .write_text(value.clone())
        .map_err(|e| {
            AppError::with_technical(
                "CLIPBOARD_COPY_FAILED",
                "Could not copy text to clipboard",
                e.to_string(),
            )
        })?;

    std::thread::sleep(Duration::from_millis(150));

    let automation = create_platform_automation();
    automation.paste_clipboard()
}
