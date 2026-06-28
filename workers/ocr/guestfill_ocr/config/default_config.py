"""Default configuration values for the OCR worker."""

from dataclasses import dataclass


@dataclass(frozen=True)
class OcrConfig:
    language: str = "eng"
    preprocessing: bool = True
    ocr_timeout_seconds: int = 300
    tesseract_cmd: str = "tesseract"
    min_confidence: float = 0.5
    preferred_engine: str = "paddleocr"
    paddleocr_conf_threshold: float = 0.5
    paddleocr_timeout: int = 30


@dataclass
class RuntimeConfig:
    enable_passport_mrz: bool = True
    enable_passport_visual_ocr: bool = True
    enable_id_card_ocr: bool = True
    prefer_paddleocr: bool = True
    per_candidate_timeout_seconds: int = 8
    max_image_width: int = 1800
    document_mode: str = "auto"


def get_default_config() -> OcrConfig:
    return OcrConfig()


def get_default_runtime_config() -> RuntimeConfig:
    return RuntimeConfig()
