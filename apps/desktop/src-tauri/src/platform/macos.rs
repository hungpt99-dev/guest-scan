use crate::error::AppError;
use super::DesktopAutomation;
use std::process::Command;
use std::time::Duration;

pub struct MacosAutomation;

impl MacosAutomation {
    pub fn new() -> Self {
        Self
    }
}

impl DesktopAutomation for MacosAutomation {
    fn focus_app(
        &self,
        window_title: Option<&str>,
        process_name: Option<&str>,
    ) -> Result<(), AppError> {
        if let Some(name) = process_name {
            let script = format!(
                "tell application \"{}\" to activate",
                escape_apple_script(name)
            );
            if run_osascript(&script).is_ok() {
                std::thread::sleep(Duration::from_millis(300));
                return Ok(());
            }
        }

        if let Some(title) = window_title {
            let script = format!(
                r#"tell application "System Events"
                    try
                        set targetProcess to first process whose front window's title contains "{}"
                        set frontmost of targetProcess to true
                    on error
                        try
                            tell application "{}" to activate
                        end try
                    end try
                end tell"#,
                escape_apple_script(title),
                escape_apple_script(title),
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

    fn fill_desktop_field(&self, automation_id: &str, value: &str) -> Result<(), AppError> {
        let escaped_value = escape_apple_script(value);
        let escaped_id = escape_apple_script(automation_id);

        let script = format!(
            r#"tell application "System Events"
                try
                    tell (first process whose frontmost is true)
                        set targetElement to missing value
                        try
                            repeat with f in (every text field of scroll area 1 of group 1 of window 1)
                                if (value of attribute "AXIdentifier" of f) is "{}" then
                                    set targetElement to f
                                    exit repeat
                                end if
                            end repeat
                        end try
                        if targetElement is missing value then
                            try
                                repeat with f in (every text field of window 1)
                                    if (value of attribute "AXIdentifier" of f) is "{}" then
                                        set targetElement to f
                                        exit repeat
                                    end if
                                end repeat
                            end try
                        end if
                        if targetElement is not missing value then
                            try
                                set value of targetElement to "{}"
                                return "OK"
                            on error
                                click targetElement
                                delay 0.15
                                keystroke "a" using command down
                                delay 0.1
                                keystroke "{}"
                                return "OK"
                            end try
                        end if
                    end tell
                    return "AX_ERROR: element not found"
                on error errMsg
                    return "AX_ERROR: " & errMsg
                end try
            end tell"#,
            escaped_id, escaped_id, escaped_value, escaped_value,
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

    fn paste_clipboard(&self) -> Result<(), AppError> {
        let script = r#"tell application "System Events" to keystroke "v" using command down"#;
        run_osascript(script)?;
        Ok(())
    }
}

fn escape_apple_script(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

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
