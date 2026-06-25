"""Manage output file paths and validation."""

from pathlib import Path


def ensure_output_dir(output_path: str) -> Path:
    path = Path(output_path)
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True)
    return path


def validate_output_path(output_path: str) -> bool:
    path = Path(output_path)
    if path.exists() and not path.is_file():
        return False
    try:
        ensure_output_dir(output_path)
        return True
    except (OSError, PermissionError):
        return False


def is_file_locked(path: str) -> bool:
    path_obj = Path(path)
    if not path_obj.exists():
        return False
    try:
        with open(path_obj, "a"):
            pass
        return False
    except (OSError, PermissionError):
        return True
