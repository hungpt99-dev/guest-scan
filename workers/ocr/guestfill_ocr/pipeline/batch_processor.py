"""Process multiple documents in batch."""

from guestfill_ocr.cli.progress_writer import make_progress, write_progress
from guestfill_ocr.pipeline.document_processor import process_document


def process_batch(
    files: list[dict], output_path: str, progress_path: str | None, job_id: str, options: dict
) -> tuple[list[dict], list[dict], list[dict]]:
    rows: list[dict] = []
    errors: list[dict] = []
    diagnostics: list[dict] = []
    total = len(files)

    for idx, file_info in enumerate(files):
        file_path = file_info["path"]
        current = idx + 1

        if progress_path:
            progress = make_progress(current, total, file_path, "PROCESSING")
            progress["jobId"] = job_id
            progress["ready"] = sum(1 for r in rows if r.get("status") == "READY")
            progress["needReview"] = sum(1 for r in rows if r.get("status") == "NEED_REVIEW")
            progress["failed"] = sum(1 for r in rows if r.get("status") == "FAILED")
            write_progress(progress_path, progress)

        result = process_document(file_path, options)
        if result.is_ok():
            data = result.unwrap()
            rows.append(data["row"])
            diagnostics.append(data["diagnostic"])
        else:
            err = result.unwrap_err()
            error_dict = {
                "row_id": f"ERR_{current}",
                "source_file": file_path,
                "error_code": err.code,
                "error_message": err.message,
                "technical_detail": err.technical_detail or "",
            }
            errors.append(error_dict)
            rows.append(
                {
                    "row_id": f"ROW_FAILED_{current}",
                    "full_name": "",
                    "surname": "",
                    "given_name": "",
                    "passport_number": "",
                    "id_number": "",
                    "nationality": "",
                    "date_of_birth": "",
                    "gender": "UNKNOWN",
                    "passport_expiry_date": "",
                    "id_expiry_date": "",
                    "issuing_country": "",
                    "issuing_authority": "",
                    "document_type": "UNKNOWN",
                    "room_number": "",
                    "arrival_date": "",
                    "departure_date": "",
                    "reservation_code": "",
                    "status": "FAILED",
                    "confidence_score": 0.0,
                    "confidence_level": "LOW",
                    "note": "",
                    "ocr_warning": err.code,
                    "source_file": file_path,
                }
            )

    if progress_path:
        write_progress(progress_path, make_progress(total, total, "", "COMPLETED"))

    return rows, errors, diagnostics
