"""Manage temporary files and directories."""

import contextlib
import shutil
import tempfile
from pathlib import Path

_current_temp_dir: Path | None = None
_cleanup_enabled: bool = True


def get_temp_dir() -> Path:
    global _current_temp_dir
    if _current_temp_dir is None:
        base = Path(tempfile.gettempdir()) / "guestfill_ocr"
        _current_temp_dir = base / _generate_job_folder()
        _current_temp_dir.mkdir(parents=True, exist_ok=True)
    return _current_temp_dir


def _generate_job_folder() -> str:
    from datetime import datetime

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    return f"ocr_job_{ts}"


def set_temp_dir(path: str | Path) -> None:
    global _current_temp_dir
    _current_temp_dir = Path(path)
    _current_temp_dir.mkdir(parents=True, exist_ok=True)


def set_cleanup(enabled: bool) -> None:
    global _cleanup_enabled
    _cleanup_enabled = enabled


def cleanup_temp_files() -> None:
    global _current_temp_dir, _cleanup_enabled
    if _current_temp_dir and _cleanup_enabled:
        with contextlib.suppress(Exception):
            shutil.rmtree(_current_temp_dir, ignore_errors=True)
        _current_temp_dir = None


def force_cleanup() -> None:
    global _current_temp_dir
    if _current_temp_dir:
        shutil.rmtree(_current_temp_dir, ignore_errors=True)
        _current_temp_dir = None
