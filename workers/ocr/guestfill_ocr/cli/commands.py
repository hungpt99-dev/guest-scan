"""CLI command definitions."""

import argparse
import sys

from guestfill_ocr.cli.request_reader import read_request
from guestfill_ocr.cli.response_writer import write_response
from guestfill_ocr.common.logging import setup_logging

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


def _handle_create_excel(request_path: str, response_path: str) -> int:
    logger = setup_logging()
    logger.info("Starting OCR job")

    request_result = read_request(request_path)

    if request_result.is_err():
        err = request_result.unwrap_err()
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
        write_response(response_path, response)
        return 1

    request = request_result.unwrap()

    from guestfill_ocr.main import process_ocr_job

    result = process_ocr_job(request)

    if result.is_err():
        err = result.unwrap_err()
        response = {
            "jobId": request.get("jobId", ""),
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
        write_response(response_path, response)
        return 1

    response = result.unwrap()
    write_response(response_path, response)

    if response.get("status") == "FAILED":
        logger.error("OCR job failed")
        return 1

    logger.info("OCR job completed successfully")
    return 0
