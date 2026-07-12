use crate::error::AppError;
use super::DesktopAutomation;
use std::time::Duration;

use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::*;
use windows::Win32::UI::Accessibility::*;
use windows::Win32::UI::WindowsAndMessaging::*;

pub struct WindowsAutomation;

impl WindowsAutomation {
    pub fn new() -> Self {
        Self
    }
}

impl DesktopAutomation for WindowsAutomation {
    fn focus_app(
        &self,
        window_title: Option<&str>,
        process_name: Option<&str>,
    ) -> Result<(), AppError> {
        unsafe {
            if let Some(title) = window_title {
                let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
                let hwnd = FindWindowW(None, &PCWSTR::from_raw(wide.as_ptr()));
                if hwnd.0 != 0 {
                    let _ = SetForegroundWindow(hwnd);
                    std::thread::sleep(Duration::from_millis(300));
                    return Ok(());
                }
            }

            if let Some(name) = process_name {
                let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
                let hwnd = FindWindowW(None, &PCWSTR::from_raw(wide.as_ptr()));
                if hwnd.0 != 0 {
                    let _ = SetForegroundWindow(hwnd);
                    std::thread::sleep(Duration::from_millis(300));
                    return Ok(());
                }
            }
        }

        Err(AppError::new(
            "MISSING_TARGET",
            "Could not find target window to focus",
        ))
    }

    fn fill_desktop_field(&self, automation_id: &str, value: &str) -> Result<(), AppError> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok();

            let uia: IUIAutomation = CoCreateInstance(
                &CUIAutomation,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| {
                AppError::with_technical(
                    "UIA_CREATE_FAILED",
                    "Failed to initialize UI Automation",
                    e.to_string(),
                )
            })?;

            let focused = uia.GetFocusedElement().map_err(|e| {
                AppError::with_technical(
                    "UIA_NO_FOCUS",
                    "No focused element found",
                    e.to_string(),
                )
            })?;

            let variant_id = VARIANT::from(automation_id);
            let condition = uia
                .CreatePropertyCondition(UIA_AutomationIdPropertyId, &variant_id)
                .map_err(|e| {
                    AppError::with_technical(
                        "UIA_CONDITION_FAILED",
                        "Failed to create search condition",
                        e.to_string(),
                    )
                })?;

            let element = focused
                .FindFirst(TreeScope_Descendants, &condition)
                .map_err(|e| {
                    AppError::with_technical(
                        "UIA_ELEMENT_NOT_FOUND",
                        &format!("UI element with automation_id '{}' not found", automation_id),
                        e.to_string(),
                    )
                })?;

            let value_pattern_raw = element
                .GetCurrentPattern(UIA_ValuePatternId)
                .map_err(|e| {
                    AppError::with_technical(
                        "UIA_NO_VALUE_PATTERN",
                        &format!("Element '{}' does not support value pattern", automation_id),
                        e.to_string(),
                    )
                })?;

            let value_pattern: IUIAutomationValuePattern = value_pattern_raw.cast().map_err(|e| {
                AppError::with_technical(
                    "UIA_PATTERN_CAST_FAILED",
                    "Failed to cast to value pattern",
                    e.to_string(),
                )
            })?;

            value_pattern.SetValue(value).map_err(|e| {
                AppError::with_technical(
                    "UIA_SET_VALUE_FAILED",
                    &format!("Failed to set value for '{}'", automation_id),
                    e.to_string(),
                )
            })?;

            Ok(())
        }
    }

    fn paste_clipboard(&self) -> Result<(), AppError> {
        unsafe {
            let inputs = [
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_CONTROL,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYDOWN,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_V,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYDOWN,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_V,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VK_CONTROL,
                            wScan: 0,
                            dwFlags: KEYEVENTF_KEYUP,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                },
            ];

            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
            Ok(())
        }
    }
}
