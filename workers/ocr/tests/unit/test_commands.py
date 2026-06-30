"""Tests for CLI commands module."""

import json
import os
import tempfile

from guestfill_ocr.cli.commands import _build_crash_response, _try_write_response


class TestBuildCrashResponse:
    def test_builds_failed_response(self) -> None:
        exc = RuntimeError("test crash")
        response = _build_crash_response("job_001", exc)

        assert response["jobId"] == "job_001"
        assert response["status"] == "FAILED"
        assert response["outputPath"] is None
        assert len(response["errors"]) == 1
        assert response["errors"][0]["code"] == "OCR_WORKER_CRASHED"
        assert response["errors"][0]["technical_detail"] == "test crash"

    def test_includes_exception_string(self) -> None:
        exc = ValueError("invalid value")
        response = _build_crash_response("job_002", exc)

        assert "invalid value" in response["errors"][0]["technical_detail"]

    def test_handles_empty_job_id(self) -> None:
        exc = Exception("error")
        response = _build_crash_response("", exc)

        assert response["jobId"] == ""


class TestTryWriteResponse:
    def test_writes_to_file(self) -> None:
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            path = f.name

        data = {"status": "COMPLETED", "jobId": "test"}
        _try_write_response(path, data, "test")

        with open(path, encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded["status"] == "COMPLETED"
        assert loaded["jobId"] == "test"

        os.unlink(path)

    def test_handles_bad_path_gracefully(self) -> None:
        result = _try_write_response("/nonexistent/dir/response.json", {"status": "FAILED"}, "test")
        assert result is None

    def test_handles_read_only_directory(self) -> None:
        import stat
        import tempfile

        d = tempfile.mkdtemp(prefix="test_ro_")
        os.chmod(d, stat.S_IRUSR | stat.S_IXUSR)
        path = os.path.join(d, "response.json")

        try:
            result = _try_write_response(path, {"status": "FAILED"}, "test")
            assert result is None
        finally:
            os.chmod(d, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
            os.rmdir(d)


class TestGetPaddleocrInstanceCrashRecovery:
    def test_marks_paddleocr_unavailable_on_failure(self) -> None:
        import contextlib

        from guestfill_ocr.ocr.paddleocr_engine import _PPOCR_AVAILABLE, check_paddleocr_available

        was_available = _PPOCR_AVAILABLE

        if was_available:
            from guestfill_ocr.ocr.paddleocr_engine import _get_paddleocr_instance

            with contextlib.suppress(RuntimeError):
                _get_paddleocr_instance(lang="nonexistent_lang_xyz")

            from guestfill_ocr.ocr.paddleocr_engine import _PPOCR_AVAILABLE as avail_after

            assert not avail_after
            assert not check_paddleocr_available()
