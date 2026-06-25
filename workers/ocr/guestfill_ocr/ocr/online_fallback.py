"""Online OCR fallback (disabled by default)."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Result


def run_online_fallback(image_path: str, api_key: str | None = None) -> Result:
    return Err(
        OcrError(
            "ONLINE_FALLBACK_FAILED",
            "Online OCR fallback is disabled by default. Enable it in settings.",
        )
    )
