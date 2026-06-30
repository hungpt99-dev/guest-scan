use crate::app_state::AppSettings;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRequest {
    pub files: Vec<String>,
    pub output_path: String,
    pub progress_path: Option<String>,
    pub options: Option<OcrOptions>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOptions {
    pub document_mode: Option<String>,
    pub max_image_width: Option<u32>,
    pub per_image_timeout_seconds: Option<u32>,
    pub per_candidate_timeout_seconds: Option<u32>,
    pub enable_passport_mrz: Option<bool>,
    pub enable_passport_visual_ocr: Option<bool>,
    pub enable_id_card_ocr: Option<bool>,
    pub enable_pdf_input: Option<bool>,
    pub enable_diagnostics_sheet: Option<bool>,
    pub delete_temp_files: Option<bool>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrJobResult {
    pub job_id: String,
    pub status: String,
    pub output_path: Option<String>,
    pub summary: OcrSummary,
    pub errors: Vec<AppError>,
}

#[derive(Serialize, Deserialize)]
pub struct OcrSummary {
    pub total_files: u32,
    pub total_documents: u32,
    pub ready: u32,
    pub need_review: u32,
    pub failed: u32,
    pub average_confidence: f64,
}

#[tauri::command]
pub async fn run_ocr(
    app_state: State<'_, crate::app_state::AppState>,
    request: OcrRequest,
) -> Result<OcrJobResult, AppError> {
    let settings = app_state
        .settings
        .lock()
        .map_err(|_| AppError::new("LOCK_ERROR", "Failed to read OCR settings"))?
        .clone();

    let job_id = uuid::Uuid::new_v4().to_string();

    let temp_dir = std::env::temp_dir().join("guestfill_ocr_jobs").join(&job_id);
    fs::create_dir_all(&temp_dir).map_err(|e| {
        AppError::with_technical("TEMP_DIR_FAILED", "Could not create temp directory", e.to_string())
    })?;

    let request_path = temp_dir.join("request.json");
    let response_path = temp_dir.join("response.json");

    let request_body = serde_json::json!({
        "jobId": job_id,
        "inputPaths": request.files,
        "outputPath": request.output_path,
        "progressPath": request.progress_path.unwrap_or_default(),
        "options": {
            "documentMode": request.options.as_ref().and_then(|o| o.document_mode.clone()).unwrap_or_else(|| "auto".to_string()),
            "maxImageWidth": request.options.as_ref().and_then(|o| o.max_image_width).unwrap_or(1800),
            "perImageTimeoutSeconds": request.options.as_ref().and_then(|o| o.per_image_timeout_seconds).unwrap_or(45),
            "perCandidateTimeoutSeconds": request.options.as_ref().and_then(|o| o.per_candidate_timeout_seconds).unwrap_or(8),
            "enablePassportMrz": request.options.as_ref().and_then(|o| o.enable_passport_mrz).unwrap_or(true),
            "enablePassportVisualOcr": request.options.as_ref().and_then(|o| o.enable_passport_visual_ocr).unwrap_or(true),
            "enableIdCardOcr": request.options.as_ref().and_then(|o| o.enable_id_card_ocr).unwrap_or(true),
            "enablePdfInput": request.options.as_ref().and_then(|o| o.enable_pdf_input).unwrap_or(true),
            "enableDiagnosticsSheet": request.options.as_ref().and_then(|o| o.enable_diagnostics_sheet).unwrap_or(true),
            "deleteTempFiles": request.options.as_ref().and_then(|o| o.delete_temp_files).unwrap_or(true),
        }
    });

    let request_json = serde_json::to_string_pretty(&request_body).map_err(|e| {
        AppError::with_technical("JSON_SERIALIZE_FAILED", "Could not serialize request", e.to_string())
    })?;

    fs::write(&request_path, &request_json).map_err(|e| {
        AppError::with_technical("REQUEST_WRITE_FAILED", "Could not write request file", e.to_string())
    })?;

    let (worker_path, worker_args) = build_worker_command(&settings);

    let mut cmd = Command::new(&worker_path);
    cmd.args(&worker_args);
    cmd.arg("create-excel");
    cmd.arg("--request");
    cmd.arg(request_path.to_string_lossy().as_ref());
    cmd.arg("--response");
    cmd.arg(response_path.to_string_lossy().as_ref());
    cmd.current_dir(temp_dir.parent().unwrap_or(&temp_dir));

    let output = cmd.output()
        .map_err(|e| {
            AppError::with_technical(
                "OCR_WORKER_FAILED",
                &format!("Could not start OCR worker. Tried: {}", worker_path),
                e.to_string(),
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let response_content = fs::read_to_string(&response_path).unwrap_or_default();
        if !response_content.is_empty() {
            if let Ok(response) = serde_json::from_str::<OcrJobResult>(&response_content) {
                return Ok(response);
            }
        }
        return Err(AppError::with_technical(
            "OCR_WORKER_FAILED",
            "OCR worker failed to process the documents.",
            &stderr.to_string(),
        ));
    }

    let response_content = fs::read_to_string(&response_path).map_err(|e| {
        AppError::with_technical("RESPONSE_READ_FAILED", "OCR worker did not produce a response", e.to_string())
    })?;

    let result: OcrJobResult = serde_json::from_str(&response_content).map_err(|e| {
        AppError::with_technical("RESPONSE_PARSE_FAILED", "Could not parse OCR worker response", e.to_string())
    })?;

    let _ = fs::remove_dir_all(&temp_dir);

    Ok(result)
}

#[tauri::command]
pub async fn run_ocr_placeholder(request: OcrRequest) -> OcrJobResult {
    let job_id = uuid::Uuid::new_v4().to_string();

    OcrJobResult {
        job_id,
        status: "COMPLETED".to_string(),
        output_path: Some(request.output_path),
        summary: OcrSummary {
            total_files: request.files.len() as u32,
            total_documents: 0,
            ready: 0,
            need_review: 0,
            failed: 0,
            average_confidence: 0.0,
        },
        errors: vec![AppError::new(
            "PLACEHOLDER",
            "OCR is not yet implemented. This is a placeholder response.",
        )],
    }
}

fn build_worker_command(settings: &AppSettings) -> (String, Vec<String>) {
    let args = || vec!["-m".to_string(), "guestfill_ocr".to_string()];

    // 1. Prefer pre-packaged executable
    for exe in &["guestfill-ocr.exe", "guestfill-ocr"] {
        if Command::new(exe).arg("--help").output().is_ok() {
            return (exe.to_string(), vec![]);
        }
    }

    // 2. Use configured worker path from settings
    if !settings.ocr_worker_path.is_empty() {
        return (settings.ocr_worker_path.clone(), args());
    }

    // 3. Try project's virtual environment (development workflow)
    for candidate in &[
        "workers/ocr/.venv/bin/python3",
        ".venv/bin/python3",
        "venv/bin/python3",
    ] {
        if Path::new(candidate).exists() {
            return (candidate.to_string(), args());
        }
    }

    // 4. Fall back to system python
    let python = if cfg!(target_os = "windows") { "python" } else { "python3" };
    (python.to_string(), args())
}
