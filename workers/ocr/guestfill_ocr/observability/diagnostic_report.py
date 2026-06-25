"""Diagnostic report generation."""

from datetime import datetime


def generate_diagnostic_report(job_id: str, options: dict, summary: dict, error_count: int) -> dict:
    return {
        "job_id": job_id,
        "generated_at": datetime.utcnow().isoformat(),
        "summary": summary,
        "error_count": error_count,
        "options_used": {
            k: v
            for k, v in options.items()
            if k in ("documentMode", "enablePassportMrz", "enableIdCardOcr", "concurrency")
        },
    }
