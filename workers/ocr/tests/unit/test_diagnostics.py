"""Tests for diagnostic report generation."""

from guestfill_ocr.observability.diagnostics import generate_diagnostic_report


class TestGenerateDiagnosticReport:
    def test_contains_required_fields(self) -> None:
        report = generate_diagnostic_report(
            job_id="test_001",
            options={"documentMode": "auto", "enablePassportMrz": True},
            summary={"total_documents": 5, "ready": 3, "failed": 0},
            error_count=0,
        )
        assert report["job_id"] == "test_001"
        assert report["ocr_worker_version"] == "0.1.0"
        assert "python_version" in report
        assert "summary" in report
        assert report["summary"]["total_documents"] == 5

    def test_filters_sensitive_options(self) -> None:
        report = generate_diagnostic_report(
            job_id="test_002",
            options={
                "documentMode": "auto",
                "enableOnlineFallback": True,
                "someSecretKey": "abc123",
            },
            summary={},
            error_count=0,
        )
        assert "someSecretKey" not in report["options_used"]
        assert report["options_used"].get("documentMode") == "auto"

    def test_empty_error_count(self) -> None:
        report = generate_diagnostic_report(
            job_id="test_003",
            options={},
            summary={},
            error_count=0,
        )
        assert report["error_count"] == 0

    def test_nonzero_error_count(self) -> None:
        report = generate_diagnostic_report(
            job_id="test_004",
            options={},
            summary={},
            error_count=3,
        )
        assert report["error_count"] == 3
