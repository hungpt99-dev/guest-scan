"""Simple metrics collector."""

from datetime import datetime


class MetricsCollector:
    def __init__(self):
        self._metrics: dict = {
            "started_at": None,
            "completed_at": None,
            "total_files": 0,
            "successful": 0,
            "failed": 0,
            "need_review": 0,
            "total_duration_ms": 0,
        }

    def start(self) -> None:
        self._metrics["started_at"] = datetime.utcnow().isoformat()

    def complete(self, duration_ms: int) -> None:
        self._metrics["completed_at"] = datetime.utcnow().isoformat()
        self._metrics["total_duration_ms"] = duration_ms

    def record_file(self, status: str) -> None:
        self._metrics["total_files"] += 1
        if status == "FAILED":
            self._metrics["failed"] += 1
        elif status == "NEED_REVIEW":
            self._metrics["need_review"] += 1
        else:
            self._metrics["successful"] += 1

    def get_summary(self) -> dict:
        return dict(self._metrics)
