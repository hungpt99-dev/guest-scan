use crate::error::AppError;
use std::process::Command;
use std::time::Duration;
use tauri::ClipboardManager;

/// Focus a target application window by process name or window title.
///
/// Uses AppleScript (`osascript`) on macOS to activate the target app.
///
/// # Behavior
/// - If `process_name` is given, activates that app by name (e.g. "Safari", "Chrome")
/// - If `window_title` is given, finds and focuses the first window whose title contains the string
/// - When both are given, tries process_name first, then window_title as fallback
#[tauri::command]
pub async fn focus_app_window(
    window_title: Option<String>,
    process_name: Option<String>,
) -> Result<(), AppError> {
    if let Some(ref name) = process_name {
        let script = format!(
            "tell application \"{}\" to activate",
            escape_apple_script(name)
        );
        if run_osascript(&script).is_ok() {
            std::thread::sleep(Duration::from_millis(300));
            return Ok(());
        }
    }

    if let Some(ref title) = window_title {
        let script = format!(
            r#"tell application "System Events"
                set frontmost of (every process whose front window's title contains "{}") to true
            end tell"#,
            escape_apple_script(title)
        );
        run_osascript(&script)?;
        std::thread::sleep(Duration::from_millis(300));
        return Ok(());
    }

    Err(AppError::new(
        "MISSING_TARGET",
        "Either window_title or process_name must be provided",
    ))
}

/// Fill a value into a native desktop application field.
///
/// Uses macOS Accessibility API (via System Events) to find a UI element
/// by its `accessibilityIdentifier` and set its `AXValue` attribute.
///
/// # Fallback
/// If the Accessibility API fails (e.g. no permission), copies the value
/// to clipboard and simulates Cmd+V paste as a fallback.
#[tauri::command]
pub async fn fill_desktop_field(automation_id: String, value: String) -> Result<(), AppError> {
    let escaped_value = escape_apple_script(&value);
    let escaped_id = escape_apple_script(&automation_id);

    let script = format!(
        r#"tell application "System Events"
            try
                set theValue to "{}"
                tell (first process whose frontmost is true)
                    try
                        set value of (first UI element whose accessibility identifier is "{}") to theValue
                        return "OK"
                    on error errMsg
                        return "AX_ERROR: " & errMsg
                    end try
                end tell
            on error errMsg
                return "PROCESS_ERROR: " & errMsg
            end try
        end tell"#,
        escaped_value, escaped_id,
    );

    let result = run_osascript(&script)?;

    if result.starts_with("AX_ERROR") || result.starts_with("PROCESS_ERROR") {
        let paste_script = format!(
            r#"set the clipboard to "{}"
            delay 0.15
            tell application "System Events" to keystroke "v" using command down"#,
            escaped_value,
        );
        run_osascript(&paste_script)?;
    }

    Ok(())
}

/// Fill a value into a web browser form field.
///
/// Copies the value to the system clipboard, then simulates Cmd+V paste
/// into the currently focused application (expected to be a browser).
///
/// This approach works across all browsers since it relies on the OS-level
/// paste command rather than browser-specific JavaScript injection.
#[tauri::command]
pub async fn fill_web_field(_selector: String, value: String, app: tauri::AppHandle) -> Result<(), AppError> {
    // Copy value to clipboard via Tauri's clipboard API
    app.clipboard_manager()
        .write_text(value.clone())
        .map_err(|e| {
            AppError::with_technical(
                "CLIPBOARD_COPY_FAILED",
                "Could not copy text to clipboard",
                e.to_string(),
            )
        })?;

    // Small delay to ensure clipboard is ready
    std::thread::sleep(Duration::from_millis(150));

    // Simulate Cmd+V paste into the focused browser window
    let paste_script = r#"tell application "System Events" to keystroke "v" using command down"#;
    run_osascript(paste_script)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Escape a string for safe embedding in AppleScript double-quoted string literals.
fn escape_apple_script(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// Run an AppleScript via `osascript -e <script>`.
///
/// Returns the stdout on success, or an `AppError` on failure.
fn run_osascript(script: &str) -> Result<String, AppError> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| {
            AppError::with_technical(
                "OSA_SCRIPT_FAILED",
                "Failed to execute AppleScript",
                e.to_string(),
            )
        })?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(AppError::with_technical(
            "OSA_SCRIPT_FAILED",
            "AppleScript execution returned an error",
            detail,
        ))
    }
}
