#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_state;
mod commands;
mod error;

use app_state::AppState;
use commands::{
    clipboard_commands, excel_commands, file_commands, ocr_commands, settings_commands,
};

fn main() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            file_commands::select_files,
            file_commands::select_folder,
            file_commands::select_output_file,
            file_commands::open_file,
            file_commands::open_folder,
            ocr_commands::run_ocr,
            ocr_commands::run_ocr_placeholder,
            excel_commands::read_excel_file,
            excel_commands::export_excel_placeholder,
            excel_commands::import_excel_placeholder,
            clipboard_commands::copy_to_clipboard,
            settings_commands::load_settings,
            settings_commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run GuestFill");
}
