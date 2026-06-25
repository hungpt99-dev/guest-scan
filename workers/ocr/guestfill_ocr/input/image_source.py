"""Determine image source for a file path."""

from pathlib import Path


def get_image_source(file_path: str) -> dict:
    path = Path(file_path)
    ext = path.suffix.lower()
    return {
        "path": str(path.absolute()),
        "ext": ext,
        "name": path.name,
        "is_pdf": ext == ".pdf",
        "is_image": ext in {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp"},
    }
