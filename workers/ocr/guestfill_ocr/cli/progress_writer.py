"""Write OCR progress update JSON files."""

import json
from pathlib import Path


def write_progress(progress_path: str | None, data: dict) -> None:
    if not progress_path:
        return
    output_path = Path(progress_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def make_progress(
    current: int,
    total: int,
    file_name: str,
    status: str,
) -> dict:
    return {
        "current": current,
        "total": total,
        "file_name": file_name,
        "status": status,
    }
