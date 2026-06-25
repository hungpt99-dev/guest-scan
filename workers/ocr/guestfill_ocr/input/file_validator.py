"""Validate input files before processing."""

from pathlib import Path

from guestfill_ocr.common.constants import SUPPORTED_FILE_EXTENSIONS
from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result

MAX_IMAGE_SIZE_MB = 20
MAX_PDF_SIZE_MB = 50
MAX_IMAGE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
MAX_PDF_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024


def validate_file(path: str) -> Result:
    file_path = Path(path)

    if not file_path.exists():
        return Err(OcrError("FILE_NOT_FOUND", f"File not found: {path}", source_file=path))

    if not file_path.is_file():
        return Err(OcrError("FILE_NOT_FOUND", f"Path is not a file: {path}", source_file=path))

    ext = file_path.suffix.lower()
    if ext not in SUPPORTED_FILE_EXTENSIONS:
        return Err(OcrError("UNSUPPORTED_FILE_TYPE", f"Unsupported file type: {ext}", source_file=path))

    try:
        file_size = file_path.stat().st_size
    except OSError as e:
        return Err(OcrError("FILE_READ_FAILED", f"Cannot read file size: {e}", source_file=path))

    if ext == ".pdf":
        if file_size > MAX_PDF_BYTES:
            return Err(OcrError("FILE_TOO_LARGE", "PDF file exceeds 50 MB limit", source_file=path))
    else:
        if file_size > MAX_IMAGE_BYTES:
            return Err(OcrError("FILE_TOO_LARGE", "Image file exceeds 20 MB limit", source_file=path))

    if file_size == 0:
        return Err(OcrError("FILE_READ_FAILED", "File is empty", source_file=path))

    return Ok({"path": str(file_path.absolute()), "ext": ext, "size": file_size})


def is_supported_extension(path: str) -> bool:
    ext = Path(path).suffix.lower()
    return ext in SUPPORTED_FILE_EXTENSIONS
