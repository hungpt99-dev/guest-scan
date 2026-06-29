"""Tests for the script detection module."""

import numpy as np

from guestfill_ocr.classification.script_detector import (
    ALL_SCRIPTS,
    SCRIPT_ARABIC,
    SCRIPT_CJK,
    SCRIPT_CYRILLIC,
    SCRIPT_DEVANAGARI,
    SCRIPT_GREEK,
    SCRIPT_HEBREW,
    SCRIPT_LATIN,
    SCRIPT_THAI,
    _compute_image_stats,
    _ensure_grayscale,
    _extract_features,
    _score_scripts,
    _score_single_script,
    detect_script,
    detect_script_from_country,
)


class TestAllScriptsDefined:
    def test_has_all_script_types(self) -> None:
        assert SCRIPT_LATIN in ALL_SCRIPTS
        assert SCRIPT_ARABIC in ALL_SCRIPTS
        assert SCRIPT_CYRILLIC in ALL_SCRIPTS
        assert SCRIPT_CJK in ALL_SCRIPTS
        assert SCRIPT_DEVANAGARI in ALL_SCRIPTS
        assert SCRIPT_THAI in ALL_SCRIPTS
        assert SCRIPT_HEBREW in ALL_SCRIPTS
        assert SCRIPT_GREEK in ALL_SCRIPTS
        assert len(ALL_SCRIPTS) == 8


class TestDetectScriptFromCountry:
    def test_china_returns_cjk(self) -> None:
        assert detect_script_from_country("CHN") == "cjk"

    def test_russia_returns_cyrillic(self) -> None:
        assert detect_script_from_country("RUS") == "cyrillic"

    def test_usa_returns_latin(self) -> None:
        assert detect_script_from_country("USA") == "latin"

    def test_uae_returns_arabic(self) -> None:
        assert detect_script_from_country("ARE") == "arabic"

    def test_india_returns_devanagari(self) -> None:
        assert detect_script_from_country("IND") == "devanagari"

    def test_none_returns_latin(self) -> None:
        assert detect_script_from_country(None) == "latin"

    def test_unknown_country_returns_latin(self) -> None:
        assert detect_script_from_country("XYZ") == "latin"


class TestEnsureGrayscale:
    def test_color_image_converted(self) -> None:
        color = np.zeros((10, 10, 3), dtype=np.uint8)
        gray = _ensure_grayscale(color)
        assert len(gray.shape) == 2

    def test_grayscale_passed_through(self) -> None:
        gray_in = np.zeros((10, 10), dtype=np.uint8)
        gray_out = _ensure_grayscale(gray_in)
        assert gray_out.shape == gray_in.shape


class TestComputeImageStats:
    def test_returns_dict_with_required_keys(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[30:70, 30:70] = 200
        stats = _compute_image_stats(gray)
        assert "fg_ratio" in stats
        assert "component_count" in stats
        assert "avg_component_area" in stats
        assert "std_component_area" in stats
        assert "h_gradient" in stats
        assert "v_gradient" in stats

    def test_fg_ratio_in_range(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[30:70, 30:70] = 200
        stats = _compute_image_stats(gray)
        assert 0 <= stats["fg_ratio"] <= 1

    def test_all_white_image(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 255
        stats = _compute_image_stats(gray)
        assert stats["fg_ratio"] > 0.5


class TestExtractFeatures:
    def test_returns_dict_with_required_keys(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[40:60, 40:60] = 200
        stats = _compute_image_stats(gray)
        features = _extract_features(gray, stats)
        required_keys = [
            "h_proj_variance",
            "edge_density",
            "local_contrast",
            "fg_ratio",
            "component_count",
            "avg_component_area",
            "std_component_area",
            "cc_ratio",
            "h_gradient_ratio",
        ]
        for key in required_keys:
            assert key in features, f"Missing feature: {key}"


class TestScoreSingleScript:
    def test_unknown_script_returns_zero(self) -> None:
        score = _score_single_script(
            "unknown_script",
            {
                "cc_ratio": 1.0,
                "fg_ratio": 0.2,
                "component_count": 50,
                "avg_component_area": 100,
                "std_component_area": 50,
                "edge_density": 0.1,
                "h_proj_variance": 100,
                "local_contrast": 30,
                "h_gradient_ratio": 1.0,
            },
        )
        assert score == 0.0

    def test_latin_returns_positive(self) -> None:
        score = _score_single_script(
            SCRIPT_LATIN,
            {
                "cc_ratio": 3.0,
                "fg_ratio": 0.3,
                "component_count": 80,
                "avg_component_area": 100,
                "std_component_area": 50,
                "edge_density": 0.1,
                "h_proj_variance": 100,
                "local_contrast": 30,
                "h_gradient_ratio": 1.0,
            },
        )
        assert score > 0.5

    def test_cjk_with_many_components(self) -> None:
        score = _score_single_script(
            SCRIPT_CJK,
            {
                "cc_ratio": 1.0,
                "fg_ratio": 0.3,
                "component_count": 200,
                "avg_component_area": 30,
                "std_component_area": 20,
                "edge_density": 0.2,
                "h_proj_variance": 100,
                "local_contrast": 30,
                "h_gradient_ratio": 1.0,
            },
        )
        assert score > 0.5


class TestScoreScripts:
    def test_returns_sorted_list(self) -> None:
        features = {
            "cc_ratio": 2.0,
            "fg_ratio": 0.3,
            "component_count": 80,
            "avg_component_area": 100,
            "std_component_area": 50,
            "edge_density": 0.1,
            "h_proj_variance": 100,
            "local_contrast": 30,
            "h_gradient_ratio": 1.0,
        }
        scores = _score_scripts(features)
        assert len(scores) == 8
        for s in scores:
            assert "script" in s
            assert "confidence" in s
        assert scores[0]["confidence"] >= scores[1]["confidence"]


class TestDetectScript:
    def test_returns_error_for_empty_image(self) -> None:
        result = detect_script(np.array([]))
        assert result.is_err()

    def test_returns_ok_for_valid_image(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[40:60, 40:60] = 200
        result = detect_script(gray)
        assert result.is_ok()

    def test_returns_dict_with_script_and_confidence(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[40:60, 40:60] = 200
        result = detect_script(gray)
        if result.is_ok():
            data = result.unwrap()
            assert "script" in data
            assert "confidence" in data
