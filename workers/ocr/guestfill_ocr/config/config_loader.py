"""Load and merge OCR configuration from request options and defaults."""

from guestfill_ocr.config.default_config import OcrConfig, get_default_config

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


def load_options(request_options: dict | None) -> dict:
    merged = dict(DEFAULT_OPTIONS)
    if request_options:
        for key, value in request_options.items():
            if key in merged:
                merged[key] = value
    return merged


def load_ocr_config() -> OcrConfig:
    return get_default_config()
