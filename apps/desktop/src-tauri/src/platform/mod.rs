use crate::error::AppError;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub trait DesktopAutomation: Send + Sync {
    fn focus_app(
        &self,
        window_title: Option<&str>,
        process_name: Option<&str>,
    ) -> Result<(), AppError>;

    fn fill_desktop_field(&self, automation_id: &str, value: &str) -> Result<(), AppError>;

    fn click_submit(&self, automation_id: &str) -> Result<(), AppError>;

    fn paste_clipboard(&self) -> Result<(), AppError>;
}

pub fn create_platform_automation() -> Box<dyn DesktopAutomation> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosAutomation::new())
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsAutomation::new())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Box::new(UnsupportedAutomation)
    }
}

#[allow(dead_code)]
struct UnsupportedAutomation;

impl DesktopAutomation for UnsupportedAutomation {
    fn focus_app(
        &self,
        _window_title: Option<&str>,
        _process_name: Option<&str>,
    ) -> Result<(), AppError> {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Desktop automation is not supported on this platform",
        ))
    }

    fn fill_desktop_field(&self, _automation_id: &str, _value: &str) -> Result<(), AppError> {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Desktop automation is not supported on this platform",
        ))
    }

    fn click_submit(&self, _automation_id: &str) -> Result<(), AppError> {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Desktop automation is not supported on this platform",
        ))
    }

    fn paste_clipboard(&self) -> Result<(), AppError> {
        Err(AppError::new(
            "UNSUPPORTED_PLATFORM",
            "Desktop automation is not supported on this platform",
        ))
    }
}
