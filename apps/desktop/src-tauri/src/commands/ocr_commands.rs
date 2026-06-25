use crate::error::AppError;

#[derive(serde::Deserialize)]
pub struct OcrRequest {
    pub files: Vec<String>,
    pub output_path: String,
    pub options: Option<OcrOptions>,
}

#[derive(serde::Deserialize)]
pub struct OcrOptions {
    pub language: Option<String>,
    pub preprocessing: Option<bool>,
}

#[derive(serde::Serialize)]
pub struct OcrJobResult {
    pub job_id: String,
    pub status: String,
    pub output_path: Option<String>,
    pub summary: OcrSummary,
    pub errors: Vec<AppError>,
}

#[derive(serde::Serialize)]
pub struct OcrSummary {
    pub total_files: u32,
    pub total_documents: u32,
    pub ready: u32,
    pub need_review: u32,
    pub failed: u32,
    pub average_confidence: f64,
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
