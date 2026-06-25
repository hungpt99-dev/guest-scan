"""OCR processing entry point."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Ok, Result
from guestfill_ocr.pipeline.job_runner import run_job

_FRIENDLY_UNKNOWN = (
    "An unexpected error occurred while processing your documents. "
    "Please try again with fewer files or contact support."
)


def process_ocr_job(request: dict) -> Result[dict]:
    try:
        response = run_job(request)
        for error in response.get("errors", []):
            if isinstance(error, dict) and "code" in error:
                if error["code"] not in (
                    "PLACEHOLDER",
                    "NO_VALID_INPUT_FILES",
                    "OUTPUT_FILE_LOCKED",
                    "PDF_RENDER_FAILED",
                    "EXCEL_WRITE_FAILED",
                ):
                    pass
        return Ok(response)
    except PermissionError:
        error = OcrError(
            "OUTPUT_FILE_LOCKED",
            "The Excel file is open in another program. Please close it and try again.",
        )
        return Ok(_build_fatal_error(request, error))
    except FileNotFoundError as e:
        error = OcrError("FILE_NOT_FOUND", f"A required file was not found: {e}")
        return Ok(_build_fatal_error(request, error))
    except MemoryError:
        error = OcrError(
            "OCR_FAILED",
            "The system ran out of memory. Please reduce the batch size and try again.",
        )
        return Ok(_build_fatal_error(request, error))
    except Exception as e:
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
