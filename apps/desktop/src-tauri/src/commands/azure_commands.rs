use crate::error::AppError;
use keyring::Entry;
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;
use tauri::State;

use crate::app_state::AppState;

const KEYRING_SERVICE: &str = "com.guestfill.ocr";
const AZURE_API_VERSION: &str = "2024-02-29-preview";
const HTTP_TIMEOUT_SECS: u64 = 60;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureFieldValue {
    pub value: String,
    pub confidence: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureExtractionResponse {
    pub doc_type: String,
    pub fields: std::collections::HashMap<String, AzureFieldValue>,
    pub content: Option<String>,
    pub overall_confidence: f64,
}

fn get_azure_credentials() -> Result<(String, String), AppError> {
    let endpoint_entry =
        Entry::new(KEYRING_SERVICE, "AZURE/endpoint").map_err(|e| {
            AppError::with_technical(
                "KEYRING_INIT_FAILED",
                "Failed to access system keychain",
                e.to_string(),
            )
        })?;

    let api_key_entry =
        Entry::new(KEYRING_SERVICE, "AZURE/api_key").map_err(|e| {
            AppError::with_technical(
                "KEYRING_INIT_FAILED",
                "Failed to access system keychain",
                e.to_string(),
            )
        })?;

    let endpoint = endpoint_entry.get_password().map_err(|_| {
        AppError::new(
            "AZURE_CREDENTIALS_MISSING",
            "Azure endpoint not configured. Set it in Settings > OCR Provider Credentials.",
        )
    })?;

    let api_key = api_key_entry.get_password().map_err(|_| {
        AppError::new(
            "AZURE_CREDENTIALS_MISSING",
            "Azure API key not configured. Set it in Settings > OCR Provider Credentials.",
        )
    })?;

    Ok((endpoint, api_key))
}

#[tauri::command]
pub async fn check_azure_available(
    _app_state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let (endpoint, api_key) = match get_azure_credentials() {
        Ok(creds) => creds,
        Err(_) => return Ok(false),
    };

    let url = format!(
        "{}/documentintelligence/documentModels?api-version={}",
        endpoint.trim_end_matches('/'),
        AZURE_API_VERSION
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| {
            AppError::with_technical(
                "HTTP_CLIENT_FAILED",
                "Failed to create HTTP client",
                e.to_string(),
            )
        })?;

    let response = client
        .get(&url)
        .header("Ocp-Apim-Subscription-Key", &api_key)
        .send()
        .await;

    match response {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn extract_azure_document(
    _app_state: State<'_, AppState>,
    image_path: String,
) -> Result<AzureExtractionResponse, AppError> {
    let (endpoint, api_key) = get_azure_credentials()?;

    let image_bytes = tokio::fs::read(&image_path).await.map_err(|e| {
        AppError::with_technical(
            "IMAGE_READ_FAILED",
            &format!("Failed to read image file: {}", image_path),
            e.to_string(),
        )
    })?;

    let image_b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &image_bytes,
    );

    let url = format!(
        "{}/documentIntelligence/documentModels/prebuilt-idDocument:analyze?api-version={}",
        endpoint.trim_end_matches('/'),
        AZURE_API_VERSION
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| {
            AppError::with_technical(
                "HTTP_CLIENT_FAILED",
                "Failed to create HTTP client",
                e.to_string(),
            )
        })?;

    let response = client
        .post(&url)
        .header("Ocp-Apim-Subscription-Key", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "base64Source": image_b64
        }))
        .send()
        .await
        .map_err(|e| {
            AppError::with_technical(
                "AZURE_API_REQUEST_FAILED",
                "Failed to send request to Azure Document Intelligence",
                e.to_string(),
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::with_technical(
            "AZURE_API_ERROR",
            &format!("Azure API returned error (HTTP {})", status),
            body,
        ));
    }

    let operation_location = response
        .headers()
        .get("Operation-Location")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            AppError::new(
                "AZURE_MISSING_OPERATION_LOCATION",
                "Azure API did not return an operation location header",
            )
        })?
        .to_string();

    let result = poll_azure_result(&client, &operation_location, &api_key).await?;

    Ok(result)
}

async fn poll_azure_result(
    client: &Client,
    operation_location: &str,
    api_key: &str,
) -> Result<AzureExtractionResponse, AppError> {
    let max_attempts = 30;
    let poll_interval = Duration::from_secs(2);

    for _ in 0..max_attempts {
        tokio::time::sleep(poll_interval).await;

        let response = client
            .get(operation_location)
            .header("Ocp-Apim-Subscription-Key", api_key)
            .send()
            .await
            .map_err(|e| {
                AppError::with_technical(
                    "AZURE_POLL_FAILED",
                    "Failed to poll Azure operation status",
                    e.to_string(),
                )
            })?;

        let body: serde_json::Value = response.json().await.map_err(|e| {
            AppError::with_technical(
                "AZURE_PARSE_FAILED",
                "Failed to parse Azure response",
                e.to_string(),
            )
        })?;

        let status = body["status"]
            .as_str()
            .unwrap_or("unknown")
            .to_lowercase();

        match status.as_str() {
            "succeeded" => {
                return parse_azure_result(&body);
            }
            "failed" => {
                let error_msg = body["error"]["message"]
                    .as_str()
                    .unwrap_or("Unknown Azure error");
                return Err(AppError::new("AZURE_ANALYSIS_FAILED", error_msg));
            }
            _ => continue,
        }
    }

    Err(AppError::new(
        "AZURE_TIMEOUT",
        "Azure Document Intelligence analysis timed out",
    ))
}

fn parse_azure_result(body: &serde_json::Value) -> Result<AzureExtractionResponse, AppError> {
    let analyze_result = &body["analyzeResult"];
    let doc_type = analyze_result["documents"]
        .as_array()
        .and_then(|docs| docs.first())
        .and_then(|doc| doc["docType"].as_str())
        .unwrap_or("unknown")
        .to_string();

    let mut fields = std::collections::HashMap::new();
    let mut total_confidence = 0.0;
    let mut field_count = 0;

    if let Some(documents) = analyze_result["documents"].as_array() {
        if let Some(doc) = documents.first() {
            if let Some(doc_fields) = doc["fields"].as_object() {
                for (field_name, field_value) in doc_fields {
                    let value = field_value["valueString"]
                        .as_str()
                        .or_else(|| field_value["content"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let confidence = field_value["confidence"].as_f64().unwrap_or(0.0);

                    fields.insert(
                        field_name.clone(),
                        AzureFieldValue {
                            value,
                            confidence,
                        },
                    );
                    total_confidence += confidence;
                    field_count += 1;
                }
            }
        }
    }

    let overall_confidence = if field_count > 0 {
        total_confidence / field_count as f64
    } else {
        0.0
    };

    let content = analyze_result["content"].as_str().map(|s| s.to_string());

    Ok(AzureExtractionResponse {
        doc_type,
        fields,
        content,
        overall_confidence,
    })
}
