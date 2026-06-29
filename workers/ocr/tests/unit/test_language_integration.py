"""Integration tests for language resolution in the OCR pipeline."""

from guestfill_ocr.ocr.paddleocr_engine import (
    get_ocr_languages_for_country,
    resolve_ocr_lang_enhanced,
)


class TestGetOcrLanguagesForCountry:
    def test_none_returns_default_list(self) -> None:
        langs = get_ocr_languages_for_country(None)
        assert "ml" in langs
        assert len(langs) >= 2

    def test_germany_prioritizes_german(self) -> None:
        langs = get_ocr_languages_for_country("DEU")
        assert langs[0] == "de"

    def test_china_prioritizes_chinese(self) -> None:
        langs = get_ocr_languages_for_country("CHN")
        assert langs[0] == "ch"

    def test_russia_prioritizes_russian(self) -> None:
        langs = get_ocr_languages_for_country("RUS")
        assert langs[0] == "ru"

    def test_uae_prioritizes_arabic(self) -> None:
        langs = get_ocr_languages_for_country("ARE")
        assert langs[0] == "ar"

    def test_vietnam_prioritizes_vietnamese(self) -> None:
        langs = get_ocr_languages_for_country("VNM")
        assert langs[0] == "vi"

    def test_usa_returns_english(self) -> None:
        langs = get_ocr_languages_for_country("USA")
        assert langs[0] == "en"

    def test_unknown_country_returns_default(self) -> None:
        langs = get_ocr_languages_for_country("XYZ")
        assert langs[0] == "ml"


class TestResolveOcrLangEnhanced:
    def test_none_returns_ml(self) -> None:
        assert resolve_ocr_lang_enhanced(None) == "ml"

    def test_germany_returns_de(self) -> None:
        assert resolve_ocr_lang_enhanced("DEU") == "de"

    def test_brazil_returns_pt(self) -> None:
        assert resolve_ocr_lang_enhanced("BRA") == "pt"

    def test_india_returns_en(self) -> None:
        assert resolve_ocr_lang_enhanced("IND") == "en"


class TestPipelineLanguageFlow:
    def test_country_code_propagates_to_language_list(self) -> None:
        langs = get_ocr_languages_for_country("ARE")
        assert "ar" in langs
        assert "ml" in langs

    def test_english_served_by_multilingual(self) -> None:
        langs = get_ocr_languages_for_country("USA")
        assert langs[0] == "en"

    def test_east_asian_gets_specific_lang(self) -> None:
        for cc, expected in [("CHN", "ch"), ("JPN", "ja"), ("KOR", "ko")]:
            langs = get_ocr_languages_for_country(cc)
            assert langs[0] == expected, f"{cc} expected {expected}, got {langs[0]}"

    def test_nordic_countries_use_english(self) -> None:
        for cc in ["SWE", "NOR", "DNK", "FIN"]:
            langs = get_ocr_languages_for_country(cc)
            assert langs[0] == "en", f"{cc} expected en, got {langs[0]}"


class TestPaddleOcrResolveBackwardCompat:
    def test_old_resolve_still_works(self) -> None:
        from guestfill_ocr.ocr.paddleocr_engine import resolve_ocr_lang

        assert resolve_ocr_lang("CHN") == "ch"
        assert resolve_ocr_lang(None) == "ml"

    def test_new_resolve_expanded(self) -> None:
        from guestfill_ocr.ocr.paddleocr_engine import resolve_ocr_lang

        assert resolve_ocr_lang("ARE") == "ar"
        assert resolve_ocr_lang("TUR") == "tr"
        assert resolve_ocr_lang("NLD") == "nl"
