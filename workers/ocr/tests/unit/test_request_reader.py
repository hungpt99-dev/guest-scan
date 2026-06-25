"""Tests for request reader."""

import json
import tempfile

from guestfill_ocr.cli.request_reader import read_request, validate_request


class TestReadRequest:
    def test_valid_request(self) -> None:
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"jobId": "test", "inputPaths": ["test.jpg"], "outputPath": "out.xlsx"}, f)
            fname = f.name
        result = read_request(fname)
        assert result.is_ok()
        data = result.unwrap()
        assert data["jobId"] == "test"
        assert "options" in data
        os.unlink(fname)

    def test_missing_file(self) -> None:
        result = read_request("/nonexistent/file.json")
        assert result.is_err()

    def test_invalid_json(self) -> None:
        import os

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("not json")
            fname = f.name
        result = read_request(fname)
        assert result.is_err()
        os.unlink(fname)


class TestValidateRequest:
    def test_valid(self) -> None:
        result = validate_request({"inputPaths": ["test.jpg"]})
        assert result.is_ok()

    def test_missing_input_paths(self) -> None:
        result = validate_request({})
        assert result.is_err()

    def test_empty_paths(self) -> None:
        result = validate_request({"inputPaths": []})
        assert result.is_err()

    def test_non_string_path(self) -> None:
        result = validate_request({"inputPaths": [123]})
        assert result.is_err()
