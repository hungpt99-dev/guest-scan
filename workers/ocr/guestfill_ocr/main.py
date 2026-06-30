"""OCR processing entry point."""

import logging

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Ok, Result
from guestfill_ocr.pipeline.job_runner import run_job

logger = logging.getLogger("guestfill_ocr.main")

_FRIENDLY_UNKNOWN = (
    "An unexpected error occurred while processing your documents. "
    "Please try again with fewer files or contact support."
)

_FRIENDLY_TIMEOUT = (
    "OCR processing timed out. Some documents may be too complex or large. "
    "Please try with fewer files or reduce per-image timeout."
)


def process_ocr_job(request: dict) -> Result[dict]:
    job_id = request.get("jobId", "unknown")
    logger.info("Job %s | process_ocr_job entered", job_id)

    try:
        response = run_job(request)
        error_codes = [
            e.get("code") for e in response.get("errors", []) if isinstance(e, dict)
        ]
        logger.info(
            "Job %s | run_job completed | status=%s errors=%s",
            job_id,
            response.get("status", "unknown"),
            error_codes,
        )
        for error in response.get("errors", []):
            if (
                isinstance(error, dict)
                and "code" in error
                and error["code"]
                not in (
                    "PLACEHOLDER",
                    "NO_VALID_INPUT_FILES",
                    "OUTPUT_FILE_LOCKED",
                    "PDF_RENDER_FAILED",
                    "EXCEL_WRITE_FAILED",
                )
            ):
                logger.warning(
                    "Job %s | unexpected error code | code=%s message=%s",
                    job_id,
                    error.get("code"),
                    error.get("message"),
                )
        return Ok(response)
    except PermissionError:
        logger.error("Job %s | PermissionError writing output", job_id)
        error = OcrError(
            "OUTPUT_FILE_LOCKED",
            "The Excel file is open in another program. Please close it and try again.",
        )
        return Ok(_build_fatal_error(request, error))
    except FileNotFoundError as e:
        logger.error("Job %s | FileNotFoundError | path=%s", job_id, e)
        error = OcrError("FILE_NOT_FOUND", f"A required file was not found: {e}")
        return Ok(_build_fatal_error(request, error))
    except MemoryError:
        logger.error("Job %s | MemoryError — system out of memory", job_id)
        error = OcrError(
            "OCR_FAILED",
            "The system ran out of memory. Please reduce the batch size and try again.",
        )
        return Ok(_build_fatal_error(request, error))
    except TimeoutError:
        logger.error("Job %s | TimeoutError — processing timed out", job_id)
        error = OcrError("OCR_TIMEOUT", _FRIENDLY_TIMEOUT)
        return Ok(_build_fatal_error(request, error))
    except OSError as e:
        logger.error(
            "Job %s | OS error | errno=%s message=%s",
            job_id,
            e.errno,
            e.strerror,
        )
        error = OcrError(
            "OS_ERROR",
            f"A file system error occurred: {e.strerror or e}",
            technical_detail=str(e),
        )
        return Ok(_build_fatal_error(request, error))
    except Exception as e:
        logger.error(
            "Job %s | unhandled exception | exception=%s",
            job_id,
            e,
            exc_info=True,
        )
        error = OcrError("UNKNOWN_ERROR", _FRIENDLY_UNKNOWN, technical_detail=str(e))
        return Ok(_build_fatal_error(request, error))


def _build_fatal_error(request: dict, error: OcrError) -> dict:
    return {
        "jobId": request.get("jobId", "unknown"),
        "status": "FAILED",
        "outputPath": None,
        "summary": {
            "totalFiles": 0,
            "totalDocuments": 0,
            "ready": 0,
            "needReview": 0,
            "failed": 0,
            "averageConfidence": 0,
        },
        "errors": [error.to_dict()],
    }
