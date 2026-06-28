"""Tests for document processor utility functions."""

from guestfill_ocr.pipeline.document_processor import _build_paddle_languages


class TestBuildPaddleLanguages:
    def test_default_languages(self) -> None:
        result = _build_paddle_languages({})
        assert "ml" in result
        assert len(result) > 0

    def test_custom_languages(self) -> None:
        result = _build_paddle_languages({"paddleOcrLanguages": ["en", "fr"]})
        assert result == ["en", "fr"]

    def test_invalid_languages_filtered(self) -> None:
        result = _build_paddle_languages({"paddleOcrLanguages": ["en", "invalid_lang", "fr"]})
        assert result == ["en", "fr"]

    def test_empty_list_returns_defaults(self) -> None:
        result = _build_paddle_languages({"paddleOcrLanguages": []})
        assert "ml" in result
        assert len(result) > 0

    def test_all_languages_if_all_valid(self) -> None:
        result = _build_paddle_languages({"paddleOcrLanguages": ["ml", "en", "fr", "de"]})
        assert result == ["ml", "en", "fr", "de"]

    def test_none_value_returns_defaults(self) -> None:
        result = _build_paddle_languages({"paddleOcrLanguages": None})
        assert "ml" in result
        assert len(result) > 0
