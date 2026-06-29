"""Tests for transliteration of non-Latin scripts to Latin."""

from guestfill_ocr.extraction.transliteration import (
    TransliterationResult,
    _detect_non_latin_script,
    transliterate,
)


class TestDetectNonLatinScript:
    def test_returns_none_for_latin(self) -> None:
        assert _detect_non_latin_script("JOHN SMITH") is None

    def test_returns_none_for_empty(self) -> None:
        assert _detect_non_latin_script("") is None

    def test_returns_arabic(self) -> None:
        result = _detect_non_latin_script("\u0627\u0644\u0633\u0644\u0627\u0645")
        assert result == "arabic"

    def test_returns_cyrillic(self) -> None:
        result = _detect_non_latin_script("\u041f\u0440\u0438\u0432\u0435\u0442")
        assert result == "cyrillic"

    def test_returns_cjk(self) -> None:
        result = _detect_non_latin_script("\u4e16\u754c")
        assert result == "cjk"

    def test_returns_devanagari(self) -> None:
        result = _detect_non_latin_script("\u0928\u092e\u0938\u094d\u0924\u0947")
        assert result == "devanagari"

    def test_returns_thai(self) -> None:
        result = _detect_non_latin_script("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35")
        assert result == "thai"

    def test_returns_greek(self) -> None:
        result = _detect_non_latin_script("\u0393\u03b5\u03b9\u03ac")
        assert result == "greek"

    def test_mixed_scripts_favors_dominant(self) -> None:
        result = _detect_non_latin_script("\u041f\u0440\u0438\u0432\u0435\u0442 \u4e16\u754c ABC")
        assert result == "cyrillic"


class TestTransliterate:
    def test_empty_text(self) -> None:
        result = transliterate("")
        assert result.latin == ""
        assert result.confidence == 0.0

    def test_latin_text_passes_through(self) -> None:
        result = transliterate("JOHN SMITH")
        assert result.latin == "JOHN SMITH"
        assert result.confidence == 1.0

    def test_arabic_to_latin(self) -> None:
        result = transliterate("\u0645\u062d\u0645\u062f", source_script="arabic")
        assert result.latin == "MHMD"
        assert result.confidence > 0

    def test_cyrillic_to_latin(self) -> None:
        result = transliterate("\u0418\u0412\u0410\u041d", source_script="cyrillic")
        assert result.latin == "IVAN"
        assert result.confidence > 0

    def test_cyrillic_lowercase(self) -> None:
        result = transliterate("\u0438\u0432\u0430\u043d", source_script="cyrillic")
        assert result.latin == "ivan"
        assert result.confidence > 0

    def test_greek_to_latin(self) -> None:
        result = transliterate("\u0399\u03a9\u0391\u039d\u039d\u0397\u03a3", source_script="greek")
        assert result.latin
        assert result.confidence > 0

    def test_devanagari_to_latin(self) -> None:
        result = transliterate("\u0930\u093e\u092e", source_script="devanagari")
        assert result.latin
        assert result.confidence > 0

    def test_thai_to_latin(self) -> None:
        result = transliterate("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35", source_script="thai")
        assert result.latin
        assert result.confidence > 0

    def test_auto_detect_arabic(self) -> None:
        result = transliterate("\u0645\u062d\u0645\u062f \u0627\u0644\u0633\u0644\u0627\u0645")
        assert result.method == "arabic_iso233"
        assert result.latin

    def test_auto_detect_cyrillic(self) -> None:
        result = transliterate("\u041f\u0443\u0442\u0438\u043d")
        assert result.method == "cyrillic_iso9"
        assert result.latin

    def test_cjk_preserved(self) -> None:
        result = transliterate("\u4e16\u754c\u597d", source_script="cjk")
        assert result.method == "cjk_preserved"
        assert result.confidence == 0.3

    def test_result_is_dataclass(self) -> None:
        result = transliterate("TEST")
        assert isinstance(result, TransliterationResult)
        assert hasattr(result, "latin")
        assert hasattr(result, "method")
        assert hasattr(result, "confidence")
        assert hasattr(result, "details")


class TestTransliterationEdgeCases:
    def test_mixed_latin_and_non_latin(self) -> None:
        result = transliterate("\u0418\u0412\u0410\u041d SMITH", source_script="cyrillic")
        assert "SMITH" in result.latin or "IVAN" in result.latin

    def test_numbers_preserved(self) -> None:
        result = transliterate("\u0418\u0412\u0410\u041d 123", source_script="cyrillic")
        assert "123" in result.latin

    def test_unknown_script_passes_through(self) -> None:
        result = transliterate("TEST", source_script="unknown")
        assert result.latin == "TEST"
        assert result.confidence == 1.0
