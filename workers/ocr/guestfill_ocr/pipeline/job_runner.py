"""Run a full OCR job."""

from guestfill_ocr.excel.export_excel import export_to_excel
from guestfill_ocr.input.file_discovery import discover_files
from guestfill_ocr.input.pdf_renderer import render_pdf
from guestfill_ocr.pipeline.batch_processor import process_batch
from guestfill_ocr.pipeline.result_builder import build_failed_response, build_response
from guestfill_ocr.storage.output_manager import ensure_output_dir, is_file_locked
from guestfill_ocr.storage.temp_manager import cleanup_temp_files, set_cleanup


def run_job(request: dict) -> dict:
    job_id = request.get("jobId", "unknown")
    input_paths = request.get("inputPaths", [])
    output_path = request.get("outputPath", "")
    progress_path = request.get("progressPath", "")
    options = request.get("options", {})

    file_result = discover_files(input_paths)
    if file_result.is_err():
        err = file_result.unwrap_err()
        set_cleanup(options.get("deleteTempFiles", True))
        cleanup_temp_files()
        return build_failed_response(job_id, [{"code": err.code, "message": err.message}])

    discovered_files = file_result.unwrap()

    if output_path and is_file_locked(output_path):
        return build_failed_response(
            job_id,
            [
                {
                    "code": "OUTPUT_FILE_LOCKED",
                    "message": "The Excel file is open in another program. Please close it and try again.",
                }
            ],
        )

    if output_path:
        try:
            ensure_output_dir(output_path)
        except (OSError, PermissionError) as e:
            return build_failed_response(
                job_id,
                [
                    {
                        "code": "OUTPUT_FILE_LOCKED",
                        "message": f"Cannot write to the output location: {e}",
                    }
                ],
            )

    all_files: list[dict] = []
    for f in discovered_files:
        if f.get("ext") == ".pdf" and options.get("enablePdfInput", True):
            pdf_result = render_pdf(f["path"])
            if pdf_result.is_ok():
                rendered = pdf_result.unwrap()
                for page_path in rendered:
                    all_files.append({"path": page_path, "ext": ".png", "size": 0})
            else:
                err = pdf_result.unwrap_err()
                return build_failed_response(job_id, [{"code": err.code, "message": err.message}])
        else:
            all_files.append(f)

    if not all_files:
        return build_failed_response(
            job_id,
            [
                {
                    "code": "NO_VALID_INPUT_FILES",
                    "message": "No valid input files could be found or rendered.",
                }
            ],
        )

    rows, errors, diagnostics = process_batch(all_files, output_path, progress_path, job_id, options)

    if output_path:
        try:
            export_to_excel(rows, errors, diagnostics, output_path, options)
        except PermissionError:
            return build_failed_response(
                job_id,
                [
                    {
                        "code": "OUTPUT_FILE_LOCKED",
                        "message": "The Excel file is open in another program. Please close it and try again.",
                    }
                ],
            )
        except Exception as e:
            return build_failed_response(
                job_id,
                [
                    {
                        "code": "EXCEL_WRITE_FAILED",
                        "message": f"Could not create the Excel file: {e}",
                    }
                ],
            )

    set_cleanup(options.get("deleteTempFiles", True))
    cleanup_temp_files()

    status = "FAILED" if all(r.get("status") == "FAILED" for r in rows) else "COMPLETED"

    return build_response(job_id, status, output_path, rows, errors)
