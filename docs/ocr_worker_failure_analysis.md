# OCR Worker Failure Analysis — `OCR_WORKER_FAILED`

## Overview

The `OCR_WORKER_FAILED` error is raised by the Tauri/Rust backend (`apps/desktop/src-tauri/src/commands/ocr_commands.rs:103,118`) when the Python OCR worker subprocess fails to start or exits with a non-zero status. The error surfaces to the Electron frontend as `{code: OCR_WORKER_FAILED, message: ...}`.

## System Architecture

```
Electron (Renderer) → Tauri Command (Rust) → spawns → Python subprocess (guestfill_ocr)
                                                        ↓
                                              File-based IPC (request.json / response.json)
```

The Rust backend:
1. Writes a `request.json` to a temp directory
2. Spawns `python3 -m guestfill_ocr create-excel --request <path> --response <path>`
3. Waits for the subprocess to exit
4. Reads `response.json` from the temp directory

## Two Distinct Failure Modes for `OCR_WORKER_FAILED`

### 1. Worker Failed to Start (Rust side, line 100-107)

```rust
cmd.output().map_err(|e| {
    AppError::with_technical(
        "OCR_WORKER_FAILED",
        &format!("Could not start OCR worker. Tried: {}", worker_path),
        e.to_string(),
    )
})?;
```

**Root causes:**
- **Python executable not found** — `build_worker_command()` (line 160-169) tries `guestfill-ocr` binary first, then falls back to `python3 -m guestfill_ocr`. If `python3` is not on `PATH` (or on Windows `python` is not on `PATH`), `Command::new` returns an `io::Error` that maps to this branch.
- **Missing dependencies** — `paddleocr`, `cv2`, or other Python packages not installed, causing the `-m guestfill_ocr` module import to crash before any output is written.

### 2. Worker Exited with Non-Zero Status (Rust side, line 109-122)

```rust
if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let response_content = fs::read_to_string(&response_path).unwrap_or_default();
    if !response_content.is_empty() {
        if let Ok(response) = serde_json::from_str::<OcrJobResult>(&response_content) {
            return Ok(response); // worker wrote its own error response
        }
    }
    return Err(AppError::with_technical(
        "OCR_WORKER_FAILED",
        "OCR worker failed to process the documents.",
        &stderr.to_string(),
    ));
}
```

**Root causes (Python side):**

The Python CLI (`workers/ocr/guestfill_ocr/cli/commands.py`) exits with code 1 in these cases, and the Rust backend falls through to the generic `OCR_WORKER_FAILED` when the worker did NOT write a response file:

- **Request file read failure** (line 107-131): `read_request()` fails — file not found, invalid JSON, missing fields, or permission error.
- **Module import failure** (line 139-168): `from guestfill_ocr.main import process_ocr_job` fails — usually a `ModuleNotFoundError` for a missing dependency (e.g., `paddleocr`, `cv2`, `openpyxl`).
- **Unhandled exception in `process_ocr_job`** (line 171-182): Any exception not caught by the try/except in `main.py:process_ocr_job()` causes `_build_crash_response()` with code `OCR_WORKER_CRASHED`. The response IS written, so this case maps to the first branch (line 113 — the JSON parse succeeds and the structured error is returned instead of the generic `OCR_WORKER_FAILED`).
- **`process_ocr_job()` returned `Err`** (line 184-213): Structured error with a specific code (e.g., `OUTPUT_FILE_LOCKED`, `FILE_NOT_FOUND`, `UNKNOWN_ERROR`). The response IS written, so the Rust side returns the structured error.

### 3. Edge Case: Response Write Failed

In `commands.py:_try_write_response()` (line 85-94), if writing the response file fails (disk full, permission denied), the response file is empty or missing. The Rust backend then falls to the generic `OCR_WORKER_FAILED` with stderr content.

## Key Code Paths in the Python Worker

### Entry Point

```python
# __main__.py → cli/commands.py:cli() → cli/commands.py:_handle_create_excel()
```

### Error Wrapping in `main.py:process_ocr_job()`

| Exception Type | Error Code | Written to Response? |
|---|---|---|
| `PermissionError` | `OUTPUT_FILE_LOCKED` | Yes |
| `FileNotFoundError` | `FILE_NOT_FOUND` | Yes |
| `MemoryError` | `OCR_FAILED` | Yes |
| Any other `Exception` | `UNKNOWN_ERROR` | Yes |

Only exceptions caught in `_handle_create_excel` (the outer try) that bypass `process_ocr_job`'s error handling can produce the generic `OCR_WORKER_FAILED` without a response file. These are the import failures and request-read failures described above.

### PaddleOCR Engine Failures

`paddleocr_engine.py` can raise `RuntimeError` during constructor initialization (line 138) or return `Err` variants for:
- `PADDLEOCR_NOT_FOUND` — paddleocr package not installed
- `IMAGE_UNREADABLE` — image cannot be loaded
- `OCR_TIMEOUT` — PaddleOCR timed out (default 30s)
- `OCR_FAILED` — generic OCR engine failure

These are internal worker errors caught within the pipeline and propagated as structured error codes in the response file — they do NOT cause `OCR_WORKER_FAILED` unless the exception is completely unhandled (missing catch in the pipeline code).

## Diagnosis Flow

To determine which case occurred:

1. Check if `response.json` was written — if yes, parse it for the actual error code
2. If no response file → worker failed to start (Python not found, missing deps)
3. If response file exists but is unparseable → file system issue (partial write, disk full)
4. Check stderr captured by Rust — if import traceback, it's a missing dependency
5. Check `build_worker_command()` resolution — does `python3 -m guestfill_ocr --help` work from the shell?

## Common Causes (Likelihood Order)

| Cause | Symptom | Where to Fix |
|---|---|---|
| Python 3 not on PATH or wrong venv | Worker fails to start, no response file | `build_worker_command()` or environment setup |
| Missing Python dependency (`paddleocr`, `cv2`, `openpyxl`, `Pillow`) | Import traceback in stderr | `requirements.txt` / `pyproject.toml` |
| Permission denied reading/writing temp files | JSON read/write errors | `cmd.current_dir()` and temp dir permissions |
| Disk full / out of space | Response write fails silently | `_try_write_response()` / Rust error handling |
| Corrupt request JSON | `read_request()` returns Err | `request_reader.py` |
