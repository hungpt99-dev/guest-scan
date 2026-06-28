"""Build OCR result structures."""


def build_summary(rows: list[dict], errors: list[dict]) -> dict:
    total = len(rows)
    ready = sum(1 for r in rows if r.get("status") == "READY")
    need_review = sum(1 for r in rows if r.get("status") == "NEED_REVIEW")
    failed = sum(1 for r in rows if r.get("status") == "FAILED")
    scores = [r.get("confidence_score", 0) for r in rows if r.get("confidence_score") is not None]
    avg_conf = round(sum(scores) / len(scores), 2) if scores else 0.0

    return {
        "total_files": len(set(r.get("source_file", "") for r in rows)),
        "total_documents": total,
        "ready": ready,
        "need_review": need_review,
        "failed": failed,
        "average_confidence": avg_conf,
    }


def build_response(job_id: str, status: str, output_path: str | None, rows: list[dict], errors: list[dict]) -> dict:
    summary = build_summary(rows, errors)
    response = {
        "jobId": job_id,
        "status": status,
        "outputPath": output_path,
        "summary": summary,
        "errors": errors,
    }
    return response


def build_failed_response(job_id: str, error_dicts: list[dict]) -> dict:
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
        "errors": error_dicts,
    }


def make_error_dict(code: str, message: str, technical_detail: str | None = None) -> dict:
    result: dict = {"code": code, "message": message}
    if technical_detail:
        result["technical_detail"] = technical_detail
    return result
