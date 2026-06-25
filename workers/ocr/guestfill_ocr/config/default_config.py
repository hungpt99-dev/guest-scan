"""Default configuration values for the OCR worker."""

from dataclasses import dataclass


@dataclass(frozen=True)
class OcrConfig:
    language: str = "eng"
    preprocessing: bool = True
    ocr_timeout_seconds: int = 300
    tesseract_cmd: str = "tesseract"
    min_confidence: float = 0.5


def get_default_config() -> OcrConfig:
    return OcrConfig()
