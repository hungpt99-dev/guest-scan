"""Tests for the language resolution module with 60+ country mapping."""

from guestfill_ocr.config.language_resolver import (
    COUNTRY_TO_SCRIPT,
    ISO3_TO_PPOCR,
    ISO3_TO_TESSERACT,
    LanguageResolution,
    get_region_priority_languages,
    get_tesseract_lang_for_script,
    resolve_ocr_languages,
    resolve_paddleocr_lang,
    resolve_script,
    resolve_tesseract_lang,
)


class TestCountryCount:
    def test_at_least_60_countries_mapped(self) -> None:
        assert len(ISO3_TO_PPOCR) >= 60, f"Expected 60+ countries, got {len(ISO3_TO_PPOCR)}"

    def test_tesseract_maps_same_count(self) -> None:
        assert len(ISO3_TO_TESSERACT) >= 60

    def test_script_map_has_all_countries(self) -> None:
        for cc in ISO3_TO_PPOCR:
            assert cc in COUNTRY_TO_SCRIPT, f"Missing script for {cc}"


class TestResolvePaddleOcrLang:
    def test_none_returns_multilingual(self) -> None:
        assert resolve_paddleocr_lang(None) == "ml"

    def test_unknown_returns_multilingual(self) -> None:
        assert resolve_paddleocr_lang("XYZ") == "ml"

    def test_western_europe_returns_english(self) -> None:
        assert resolve_paddleocr_lang("GBR") == "en"
        assert resolve_paddleocr_lang("USA") == "en"
        assert resolve_paddleocr_lang("CAN") == "en"

    def test_france_returns_french(self) -> None:
        assert resolve_paddleocr_lang("FRA") == "fr"

    def test_germany_returns_german(self) -> None:
        assert resolve_paddleocr_lang("DEU") == "de"

    def test_spain_returns_spanish(self) -> None:
        assert resolve_paddleocr_lang("ESP") == "es"

    def test_italy_returns_italian(self) -> None:
        assert resolve_paddleocr_lang("ITA") == "it"

    def test_brazil_returns_portuguese(self) -> None:
        assert resolve_paddleocr_lang("BRA") == "pt"

    def test_russia_returns_russian(self) -> None:
        assert resolve_paddleocr_lang("RUS") == "ru"

    def test_ukraine_returns_russian(self) -> None:
        assert resolve_paddleocr_lang("UKR") == "ru"

    def test_china_returns_chinese(self) -> None:
        assert resolve_paddleocr_lang("CHN") == "ch"

    def test_taiwan_returns_chinese(self) -> None:
        assert resolve_paddleocr_lang("TWN") == "ch"

    def test_japan_returns_japanese(self) -> None:
        assert resolve_paddleocr_lang("JPN") == "ja"

    def test_korea_returns_korean(self) -> None:
        assert resolve_paddleocr_lang("KOR") == "ko"

    def test_vietnam_returns_vietnamese(self) -> None:
        assert resolve_paddleocr_lang("VNM") == "vi"

    def test_uae_returns_arabic(self) -> None:
        assert resolve_paddleocr_lang("ARE") == "ar"

    def test_saudi_arabia_returns_arabic(self) -> None:
        assert resolve_paddleocr_lang("SAU") == "ar"

    def test_egypt_returns_arabic(self) -> None:
        assert resolve_paddleocr_lang("EGY") == "ar"

    def test_turkey_returns_turkish(self) -> None:
        assert resolve_paddleocr_lang("TUR") == "tr"

    def test_netherlands_returns_dutch(self) -> None:
        assert resolve_paddleocr_lang("NLD") == "nl"

    def test_poland_returns_polish(self) -> None:
        assert resolve_paddleocr_lang("POL") == "pl"

    def test_india_returns_english(self) -> None:
        assert resolve_paddleocr_lang("IND") == "en"

    def test_israel_returns_english(self) -> None:
        assert resolve_paddleocr_lang("ISR") == "en"

    def test_australia_returns_english(self) -> None:
        assert resolve_paddleocr_lang("AUS") == "en"

    def test_sweden_returns_english(self) -> None:
        assert resolve_paddleocr_lang("SWE") == "en"


class TestResolveTesseractLang:
    def test_none_returns_english(self) -> None:
        assert resolve_tesseract_lang(None) == "eng"

    def test_unknown_returns_english(self) -> None:
        assert resolve_tesseract_lang("XYZ") == "eng"

    def test_france_returns_french(self) -> None:
        assert resolve_tesseract_lang("FRA") == "fra"

    def test_germany_returns_german(self) -> None:
        assert resolve_tesseract_lang("DEU") == "deu"

    def test_china_returns_chinese_simplified(self) -> None:
        assert resolve_tesseract_lang("CHN") == "chi_sim"

    def test_taiwan_returns_chinese_traditional(self) -> None:
        assert resolve_tesseract_lang("TWN") == "chi_tra"

    def test_japan_returns_japanese(self) -> None:
        assert resolve_tesseract_lang("JPN") == "jpn"

    def test_korea_returns_korean(self) -> None:
        assert resolve_tesseract_lang("KOR") == "kor"

    def test_russia_returns_russian(self) -> None:
        assert resolve_tesseract_lang("RUS") == "rus"

    def test_uae_returns_arabic(self) -> None:
        assert resolve_tesseract_lang("ARE") == "ara"


class TestResolveScript:
    def test_none_returns_latin(self) -> None:
        assert resolve_script(None) == "latin"

    def test_china_returns_cjk(self) -> None:
        assert resolve_script("CHN") == "cjk"

    def test_usa_returns_latin(self) -> None:
        assert resolve_script("USA") == "latin"

    def test_russia_returns_cyrillic(self) -> None:
        assert resolve_script("RUS") == "cyrillic"

    def test_uae_returns_arabic(self) -> None:
        assert resolve_script("ARE") == "arabic"

    def test_india_returns_devanagari(self) -> None:
        assert resolve_script("IND") == "devanagari"

    def test_thailand_returns_thai(self) -> None:
        assert resolve_script("THA") == "thai"

    def test_israel_returns_hebrew(self) -> None:
        assert resolve_script("ISR") == "hebrew"

    def test_greece_returns_greek(self) -> None:
        assert resolve_script("GRC") == "greek"


class TestResolveOcrLanguages:
    def test_none_returns_unknown_resolution(self) -> None:
        res = resolve_ocr_languages(None)
        assert res.primary == "ml"
        assert res.script == "latin"
        assert res.confidence == 0.5

    def test_unknown_returns_fallback(self) -> None:
        res = resolve_ocr_languages("XYZ")
        assert res.primary == "ml"
        assert res.confidence == 0.5

    def test_germany_returns_german_primary(self) -> None:
        res = resolve_ocr_languages("DEU")
        assert res.primary == "de"
        assert res.tesseract_primary == "deu"
        assert res.script == "latin"

    def test_china_returns_chinese_with_cjk(self) -> None:
        res = resolve_ocr_languages("CHN")
        assert res.primary == "ch"
        assert res.script == "cjk"
        assert "ch" in res.alternatives
        assert "en" in res.alternatives

    def test_arabic_country_includes_english(self) -> None:
        res = resolve_ocr_languages("ARE")
        assert res.primary == "ar"
        assert res.script == "arabic"
        assert "en" in res.alternatives

    def test_bangladesh_returns_bengali_tesseract(self) -> None:
        res = resolve_ocr_languages("BGD")
        assert res.primary == "en"
        assert res.tesseract_primary == "ben"
        assert res.script == "bengali"

    def test_sweden_returns_english_primary(self) -> None:
        res = resolve_ocr_languages("SWE")
        assert res.primary == "en"
        assert res.tesseract_primary == "swe"

    def test_czech_republic(self) -> None:
        res = resolve_ocr_languages("CZE")
        assert res.primary == "en"
        assert res.tesseract_primary == "ces"

    def test_brazil_returns_portuguese(self) -> None:
        res = resolve_ocr_languages("BRA")
        assert res.primary == "pt"
        assert res.tesseract_primary == "por"
        assert res.script == "latin"

    def test_vietnam_returns_vietnamese(self) -> None:
        res = resolve_ocr_languages("VNM")
        assert res.primary == "vi"
        assert res.tesseract_primary == "vie"
        assert res.script == "latin"


class TestResolutionType:
    def test_is_dataclass(self) -> None:
        res = resolve_ocr_languages("USA")
        assert isinstance(res, LanguageResolution)
        assert hasattr(res, "primary")
        assert hasattr(res, "alternatives")
        assert hasattr(res, "script")
        assert hasattr(res, "tesseract_primary")
        assert hasattr(res, "tesseract_alternatives")
        assert hasattr(res, "confidence")


class TestGetRegionLanguages:
    def test_returns_list(self) -> None:
        langs = get_region_priority_languages("latin")
        assert len(langs) >= 2
        assert "ml" in langs

    def test_arabic_includes_arabic(self) -> None:
        langs = get_region_priority_languages("arabic")
        assert "ar" in langs

    def test_cjk_includes_chinese(self) -> None:
        langs = get_region_priority_languages("cjk")
        assert "ch" in langs

    def test_unknown_script_returns_fallback(self) -> None:
        langs = get_region_priority_languages("unknown")
        assert "ml" in langs


class TestGetTesseractForScript:
    def test_latin_includes_multiple(self) -> None:
        langs = get_tesseract_lang_for_script("latin")
        assert "eng" in langs
        assert "fra" in langs

    def test_cyrillic_includes_russian(self) -> None:
        langs = get_tesseract_lang_for_script("cyrillic")
        assert "rus" in langs

    def test_unknown_script_returns_english(self) -> None:
        langs = get_tesseract_lang_for_script("unknown")
        assert langs == ["eng"]

    def test_arabic_includes_arabic(self) -> None:
        langs = get_tesseract_lang_for_script("arabic")
        assert "ara" in langs


class TestMajorRegions:
    def test_western_europe(self) -> None:
        for cc in ["GBR", "FRA", "DEU", "ITA", "ESP", "PRT", "NLD", "BEL", "CHE", "AUT"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_eastern_europe(self) -> None:
        for cc in ["POL", "CZE", "HUN", "ROU", "GRC", "TUR"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_nordic(self) -> None:
        for cc in ["SWE", "NOR", "DNK", "FIN"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_middle_east(self) -> None:
        for cc in ["ARE", "SAU", "QAT", "OMN", "BHR", "KWT", "JOR", "ISR", "IRN", "IRQ", "SYR", "LBN"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_north_africa(self) -> None:
        for cc in ["EGY", "MAR", "DZA", "TUN", "LBY"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_east_asia(self) -> None:
        for cc in ["CHN", "JPN", "KOR", "TWN", "HKG"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_southeast_asia(self) -> None:
        for cc in ["VNM", "IDN", "PHL", "MYS", "SGP", "THA", "MMR", "KHM", "LAO"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_south_asia(self) -> None:
        for cc in ["IND", "NPL", "BGD", "PAK", "LKA"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_latin_america(self) -> None:
        for cc in ["BRA", "MEX", "ARG", "COL", "CHL", "PER", "VEN"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"

    def test_anglo_sphere(self) -> None:
        for cc in ["USA", "CAN", "GBR", "AUS", "NZL", "IRL", "ZAF"]:
            assert cc in ISO3_TO_PPOCR, f"Missing {cc}"
