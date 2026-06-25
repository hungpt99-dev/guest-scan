"""Read and validate OCR request JSON files."""

import json
from pathlib import Path

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result

DEFAULT_OPTIONS: dict = {
    "documentMode": "auto",
    "outputDateFormat": "yyyy-MM-dd",
    "countryFormat": "ISO3",
    "maxImageWidth": 1800,
    "concurrency": 1,
    "candidateLimit": 16,
    "perImageTimeoutSeconds": 45,
    "perCandidateTimeoutSeconds": 8,
    "enablePassportMrz": True,
    "enablePassportVisualOcr": True,
    "enableIdCardOcr": True,
    "enableQrBarcodeRead": True,
    "enablePdfInput": True,
    "enableDiagnosticsSheet": True,
    "enableLocalDiagnostics": False,
    "enableOnlineFallback": False,
    "deleteTempFiles": True,
    "includeErrorsSheet": True,
    "includeInstructionsSheet": True,
}


def read_request(path: str) -> Result:
    try:
        file_path = Path(path)
        if not file_path.exists():
            return Err(OcrError("FILE_NOT_FOUND", f"Request file not found: {path}"))

        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return Err(OcrError("INVALID_JSON", f"Request file is not valid JSON: {e}"))
    except OSError as e:
        return Err(OcrError("READ_ERROR", f"Failed to read request file: {e}"))

    validation = validate_request(data)
    if validation.is_err():
        return Err(validation.unwrap_err())

    merged_options = dict(DEFAULT_OPTIONS)
    request_options = data.get("options", {})
    if isinstance(request_options, dict):
        for key, value in request_options.items():
            if key in merged_options:
                merged_options[key] = value

    data["options"] = merged_options
    return Ok(data)


def validate_request(data: dict) -> Result:
    if "inputPaths" not in data and "files" not in data:
        return Err(OcrError("MISSING_FIELD", "Request must contain 'inputPaths' array"))

    paths = data.get("inputPaths") or data.get("files", [])
    if not isinstance(paths, list) or len(paths) == 0:
        return Err(OcrError("INVALID_FILES", "Request 'inputPaths' must be a non-empty array"))

    for f in paths:
        if not isinstance(f, str):
            return Err(OcrError("INVALID_FILE", "Each file path must be a string"))

    if not data.get("outputPath") and not data.get("output_path"):
        pass

    return Ok(None)
