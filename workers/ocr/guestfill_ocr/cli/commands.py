"""CLI command definitions."""

import argparse
import logging
import sys
import traceback

from guestfill_ocr.cli.request_reader import read_request
from guestfill_ocr.cli.response_writer import write_response
from guestfill_ocr.common.logging import setup_logging

logger = logging.getLogger("guestfill_ocr.cli.commands")

_FRIENDLY_ERROR_MESSAGES: dict[str, str] = {
    "NO_INPUT_FILES": "No input files were provided. Please select at least one file or folder.",
    "NO_VALID_INPUT_FILES": "No valid input files were found. Supported formats: JPG, PNG, WEBP, PDF.",
    "UNSUPPORTED_FILE_TYPE": "This file type is not supported. Please use JPG, PNG, WEBP, or PDF.",
    "FILE_NOT_FOUND": "A file or folder could not be found. Please check the path and try again.",
    "FILE_TOO_LARGE": "This file is too large. Image files must be under 20 MB. PDF files under 50 MB.",
    "FILE_READ_FAILED": "Could not read this file. It may be corrupted or protected.",
    "PDF_RENDER_FAILED": "Could not read this PDF file. It may be corrupted or password-protected.",
    "IMAGE_LOAD_FAILED": "Could not read this image. It may be corrupted or in an unsupported format.",
    "IMAGE_UNREADABLE": "This image could not be opened for OCR. It may be corrupted.",
    "OCR_TIMEOUT": "OCR processing timed out for this file. It may be too complex or large.",
    "OCR_FAILED": "OCR processing failed for this file. The text could not be extracted.",
    "TESSERACT_NOT_FOUND": (
        "Tesseract OCR engine is not installed. Please install Tesseract"
        " (brew install tesseract on macOS, apt install tesseract-ocr on Linux)"
        " and try again."
    ),
    "MRZ_NOT_FOUND": "No machine-readable zone (MRZ) was found in this document.",
    "MRZ_PARSE_FAILED": "The MRZ could not be parsed. The text may be damaged or incomplete.",
    "CHECK_DIGIT_FAILED": "The document number check digit failed. Please verify manually.",
    "ID_CARD_PARSE_FAILED": "Could not extract fields from this ID card. The layout may be different.",
    "QR_BARCODE_READ_FAILED": "QR or barcode could not be read from this document.",
    "EXCEL_WRITE_FAILED": "Could not create the Excel file. Please check the output path is writable.",
    "OUTPUT_FILE_LOCKED": "The Excel file is open in another program. Please close it and try again.",
    "TEMP_FILE_CLEANUP_FAILED": "Temporary files could not be cleaned up. This is not critical.",
    "UNKNOWN_ERROR": "An unexpected error occurred. Please try again or contact support.",
}


def cli() -> None:
    parser = argparse.ArgumentParser(description="GuestFill OCR Worker - Extract guest info from documents")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_excel_parser = subparsers.add_parser("create-excel", help="Process documents and create Excel")
    create_excel_parser.add_argument("--request", required=True, help="Path to request JSON file")
    create_excel_parser.add_argument("--response", required=True, help="Path to write response JSON")

    args = parser.parse_args()

    if args.command == "create-excel":
        exit_code = _handle_create_excel(args.request, args.response)
        sys.exit(exit_code)


def _get_user_friendly_error(code: str, fallback: str) -> str:
    return _FRIENDLY_ERROR_MESSAGES.get(code, fallback)


def _build_crash_response(job_id: str, exc: Exception) -> dict:
    return {
        "jobId": job_id,
        "status": "FAILED",
        "outputPath": None,
        "summary": {
            "total_files": 0,
            "total_documents": 0,
            "ready": 0,
            "need_review": 0,
            "failed": 0,
            "average_confidence": 0,
        },
        "errors": [
            {
                "code": "OCR_WORKER_CRASHED",
                "message": "The OCR worker crashed unexpectedly. Please try again with fewer files.",
                "technical_detail": str(exc),
            }
        ],
    }


def _try_write_response(response_path: str, data: dict, job_id: str) -> None:
    try:
        write_response(response_path, data)
    except Exception as e:
        logger.error(
            "Job %s | failed to write response file | path=%s error=%s",
            job_id,
            response_path,
            e,
        )


def _handle_create_excel(request_path: str, response_path: str) -> int:
    logger = setup_logging()
    logger.info(
        "Worker started | request=%s response=%s",
        request_path,
        response_path,
    )

    request_result = read_request(request_path)

    if request_result.is_err():
        err = request_result.unwrap_err()
        logger.error("Request read failed | code=%s message=%s", err.code, err.message)
        response = {
            "jobId": "",
            "status": "FAILED",
            "outputPath": None,
            "summary": {
                "total_files": 0,
                "total_documents": 0,
                "ready": 0,
                "need_review": 0,
                "failed": 0,
                "average_confidence": 0,
            },
            "errors": [
                {
                    "code": err.code,
                    "message": _get_user_friendly_error(err.code, err.message),
                    "technical_detail": err.message if hasattr(err, "message") else None,
                }
            ],
        }
        _try_write_response(response_path, response, "")
        return 1

    request = request_result.unwrap()
    job_id = request.get("jobId", "unknown")
    file_count = len(request.get("inputPaths", request.get("files", [])))
    logger.info("Job %s | files=%d | importing modules", job_id, file_count)

    try:
        from guestfill_ocr.main import process_ocr_job
    except Exception as exc:
        logger.error(
            "Job %s | module import failed | exception=%s traceback=%s",
            job_id,
            exc,
            traceback.format_exc(),
        )
        response = {
            "jobId": job_id,
            "status": "FAILED",
            "outputPath": None,
            "summary": {
                "total_files": 0,
                "total_documents": 0,
                "ready": 0,
                "need_review": 0,
                "failed": 0,
                "average_confidence": 0,
            },
            "errors": [
                {
                    "code": "IMPORT_FAILED",
                    "message": "OCR worker module failed to load.",
                    "technical_detail": str(exc),
                }
            ],
        }
        _try_write_response(response_path, response, job_id)
        return 1

    logger.info("Job %s | processing started", job_id)
    try:
        result = process_ocr_job(request)
    except Exception as exc:
        logger.error(
            "Job %s | process_ocr_job raised | exception=%s",
            job_id,
            exc,
            exc_info=True,
        )
        response = _build_crash_response(job_id, exc)
        _try_write_response(response_path, response, job_id)
        return 1

    if result.is_err():
        err = result.unwrap_err()
        logger.error(
            "Job %s | process_ocr_job returned error | code=%s message=%s",
            job_id,
            err.code,
            err.message,
        )
        response = {
            "jobId": job_id,
            "status": "FAILED",
            "outputPath": None,
            "summary": {
                "total_files": 0,
                "total_documents": 0,
                "ready": 0,
                "need_review": 0,
                "failed": 0,
                "average_confidence": 0,
            },
            "errors": [
                {
                    "code": err.code,
                    "message": _get_user_friendly_error(err.code, err.message),
                    "technical_detail": err.message if hasattr(err, "message") else None,
                }
            ],
        }
        _try_write_response(response_path, response, job_id)
        return 1

    response = result.unwrap()
    _try_write_response(response_path, response, job_id)

    if response.get("status") == "FAILED":
        logger.error("Job %s | completed with FAILED status", job_id)
        return 1

    logger.info("Job %s | completed successfully", job_id)
    return 0
