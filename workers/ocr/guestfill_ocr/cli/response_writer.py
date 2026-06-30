"""Write OCR response JSON files with atomic writes and retry logic."""

import json
import os
import time
from pathlib import Path


def write_response(path: str, data: dict, max_retries: int = 3, retry_delay: float = 0.5) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    temp_path = output_path.with_suffix(".json.tmp")

    last_error: Exception | None = None
    for attempt in range(max_retries):
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, output_path)
            return
        except (OSError, PermissionError) as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(retry_delay * (2**attempt))
            continue

    raise OSError(f"Failed to write response after {max_retries} attempts: {last_error}") from last_error
