"""Diagnostic report generation for the OCR worker."""

import json
import platform
from datetime import datetime


def generate_diagnostic_report(job_id: str, options: dict, summary: dict, error_count: int) -> dict:
    return {
        "job_id": job_id,
        "generated_at": datetime.utcnow().isoformat(),
        "ocr_worker_version": "0.1.0",
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "platform_release": platform.release(),
        "summary": summary,
        "error_count": error_count,
        "options_used": {
            k: v
            for k, v in options.items()
            if k
            in (
                "documentMode",
                "enablePassportMrz",
                "enableIdCardOcr",
                "concurrency",
                "enablePassportVisualOcr",
                "enableQrBarcodeRead",
                "enablePdfInput",
                "enableDiagnosticsSheet",
                "deleteTempFiles",
                "perImageTimeoutSeconds",
            )
        },
    }


def write_diagnostic_report(report: dict, output_path: str) -> None:
    from pathlib import Path

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
