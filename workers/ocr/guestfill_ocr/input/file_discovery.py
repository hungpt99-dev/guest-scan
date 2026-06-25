"""Discover and collect input files from paths and folders."""

from pathlib import Path

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.input.file_validator import is_supported_extension, validate_file


def discover_files(input_paths: list[str]) -> Result:
    if not input_paths:
        return Err(OcrError("NO_INPUT_FILES", "No input paths provided"))

    discovered: list[dict] = []
    errors: list[OcrError] = []

    for input_path in input_paths:
        path_obj = Path(input_path)

        if not path_obj.exists():
            errors.append(OcrError("FILE_NOT_FOUND", f"Path not found: {input_path}", source_file=input_path))
            continue

        if path_obj.is_file():
            result = validate_file(input_path)
            if result.is_ok():
                discovered.append(result.unwrap())
            else:
                err = result.unwrap_err()
                errors.append(err)

        elif path_obj.is_dir():
            folder_results = _discover_folder(path_obj)
            discovered.extend(folder_results["valid"])
            errors.extend(folder_results["errors"])

        else:
            errors.append(
                OcrError(
                    "FILE_NOT_FOUND",
                    f"Unrecognized path type: {input_path}",
                    source_file=input_path,
                )
            )

    if not discovered:
        combined = "; ".join(e.message for e in errors[:5])
        return Err(OcrError("NO_VALID_INPUT_FILES", f"No valid input files found: {combined}"))

    return Ok(discovered)


def _discover_folder(folder: Path) -> dict:
    valid: list[dict] = []
    errors: list[OcrError] = []

    for file_path in sorted(folder.iterdir()):
        if file_path.is_file() and is_supported_extension(str(file_path)):
            result = validate_file(str(file_path))
            if result.is_ok():
                valid.append(result.unwrap())
            else:
                errors.append(result.unwrap_err())

    return {"valid": valid, "errors": errors}
