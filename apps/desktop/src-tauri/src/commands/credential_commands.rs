use crate::error::AppError;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;

const KEYRING_SERVICE: &str = "com.guestfill.ocr";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub provider: String,
    pub has_key: bool,
    pub has_endpoint: bool,
    pub endpoint_preview: String,
    pub key_preview: String,
}

#[derive(Deserialize)]
pub struct SaveCredentialRequest {
    pub provider: String,
    pub key_type: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct GetCredentialRequest {
    pub provider: String,
    pub key_type: String,
}

fn credential_entry(provider: &str, key_type: &str) -> Entry {
    Entry::new(KEYRING_SERVICE, &format!("{}/{}", provider, key_type))
        .expect("Failed to create keyring entry")
}

#[tauri::command]
pub async fn save_credential(
    _app_state: State<'_, AppState>,
    request: SaveCredentialRequest,
) -> Result<(), AppError> {
    let entry = credential_entry(&request.provider, &request.key_type);
    entry
        .set_password(&request.value)
        .map_err(|e| {
            AppError::with_technical(
                "CREDENTIAL_SAVE_FAILED",
                "Failed to save credential to system keychain",
                e.to_string(),
            )
        })?;
    Ok(())
}

#[tauri::command]
pub async fn get_credential(
    _app_state: State<'_, AppState>,
    request: GetCredentialRequest,
) -> Result<String, AppError> {
    let entry = credential_entry(&request.provider, &request.key_type);
    entry
        .get_password()
        .map_err(|e| {
            AppError::with_technical(
                "CREDENTIAL_GET_FAILED",
                "Failed to read credential from system keychain",
                e.to_string(),
            )
        })
}

#[tauri::command]
pub async fn delete_credential(
    _app_state: State<'_, AppState>,
    request: GetCredentialRequest,
) -> Result<(), AppError> {
    let entry = credential_entry(&request.provider, &request.key_type);
    entry
        .delete_credential()
        .map_err(|e| {
            AppError::with_technical(
                "CREDENTIAL_DELETE_FAILED",
                "Failed to delete credential from system keychain",
                e.to_string(),
            )
        })
}

fn mask_value(value: &str) -> String {
    if value.len() <= 8 {
        return "****".to_string();
    }
    let prefix = &value[..4];
    let suffix = &value[value.len() - 4..];
    format!("{}...{}", prefix, suffix)
}

#[tauri::command]
pub async fn check_credential_status(
    _app_state: State<'_, AppState>,
    provider: String,
) -> Result<CredentialStatus, AppError> {
    let api_key_entry = credential_entry(&provider, "api_key");
    let endpoint_entry = credential_entry(&provider, "endpoint");

    let api_key = api_key_entry.get_password().ok();
    let endpoint = endpoint_entry.get_password().ok();

    Ok(CredentialStatus {
        provider,
        has_key: api_key.is_some(),
        has_endpoint: endpoint.is_some(),
        endpoint_preview: endpoint
            .as_ref()
            .map(|e| {
                if e.len() > 30 {
                    format!("{}...", &e[..30])
                } else {
                    e.clone()
                }
            })
            .unwrap_or_default(),
        key_preview: api_key.as_ref().map(|k| mask_value(k)).unwrap_or_default(),
    })
}
