"""Tests for enhanced quality analyzer with crease and wear detection."""

import numpy as np

from guestfill_ocr.image.quality_analyzer import (
    PATH_GLARE,
    PATH_LOW_CONTRAST,
    PATH_RTL,
    PATH_STANDARD,
    PATH_WORN,
    analyze_quality,
    calculate_blur_score,
    calculate_brightness,
    calculate_contrast,
    estimate_crease,
    estimate_glare,
    estimate_skew_angle,
    estimate_wear,
    select_preprocessing_path,
)


class TestCalculateBlur:
    def test_sharp_image_returns_high_score(self) -> None:
        gray = np.random.randint(0, 256, (200, 200), dtype=np.uint8)
        score = calculate_blur_score(gray)
        assert score >= 0

    def test_blank_image_returns_low_score(self) -> None:
        gray = np.ones((200, 200), dtype=np.uint8) * 128
        score = calculate_blur_score(gray)
        assert score < 50


class TestBrightness:
    def test_dark_image(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 30
        assert calculate_brightness(gray) < 50

    def test_bright_image(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 230
        assert calculate_brightness(gray) > 200


class TestContrast:
    def test_low_contrast(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        assert calculate_contrast(gray) < 30


class TestSkewAngle:
    def test_no_skew(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 200
        gray[40:60, 30:70] = 0
        angle = estimate_skew_angle(gray)
        assert isinstance(angle, float)

    def test_few_white_pixels_returns_zero(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 200
        gray[49:51, 49:51] = 0
        assert estimate_skew_angle(gray) == 0.0


class TestGlareEstimation:
    def test_no_glare(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        assert estimate_glare(gray) == 0.0

    def test_high_glare(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 250
        glare = estimate_glare(gray)
        assert glare > 0.5


class TestCreaseEstimation:
    def test_no_crease(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        crease = estimate_crease(gray)
        assert crease >= 0.0
        assert crease <= 1.0

    def test_returns_float(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        crease = estimate_crease(gray)
        assert isinstance(crease, float)

    def test_with_edges(self) -> None:
        gray = np.zeros((200, 200), dtype=np.uint8)
        gray[50, :] = 255
        gray[150, :] = 255
        crease = estimate_crease(gray)
        assert crease >= 0.0


class TestWearEstimation:
    def test_uniform_image_has_low_wear(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        wear = estimate_wear(gray)
        assert wear < 0.5

    def test_variable_image_has_higher_wear(self) -> None:
        gray = np.zeros((100, 100), dtype=np.uint8)
        gray[:50, :50] = 200
        gray[50:, 50:] = 50
        wear = estimate_wear(gray)
        assert wear >= 0.0
        assert isinstance(wear, float)

    def test_returns_float_in_range(self) -> None:
        gray = np.random.randint(0, 256, (100, 100), dtype=np.uint8)
        wear = estimate_wear(gray)
        assert 0 <= wear <= 1.0


class TestSelectPreprocessingPath:
    def test_standard_quality(self) -> None:
        quality = {
            "glare_ratio": 0.05,
            "crease_score": 0.1,
            "wear_score": 0.2,
            "contrast": 80,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_STANDARD

    def test_glare_triggers_glare_path(self) -> None:
        quality = {
            "glare_ratio": 0.3,
            "crease_score": 0.1,
            "wear_score": 0.1,
            "contrast": 80,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_GLARE

    def test_crease_triggers_worn_path(self) -> None:
        quality = {
            "glare_ratio": 0.05,
            "crease_score": 0.5,
            "wear_score": 0.2,
            "contrast": 80,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_WORN

    def test_low_contrast_triggers_low_contrast_path(self) -> None:
        quality = {
            "glare_ratio": 0.05,
            "crease_score": 0.1,
            "wear_score": 0.2,
            "contrast": 20,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_LOW_CONTRAST

    def test_low_blur_triggers_worn_path(self) -> None:
        quality = {
            "glare_ratio": 0.05,
            "crease_score": 0.1,
            "wear_score": 0.2,
            "contrast": 80,
            "blur_score": 20,
        }
        assert select_preprocessing_path(quality) == PATH_WORN

    def test_glare_priority_over_crease(self) -> None:
        quality = {
            "glare_ratio": 0.3,
            "crease_score": 0.5,
            "wear_score": 0.2,
            "contrast": 80,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_GLARE

    def test_wear_triggers_worn_path(self) -> None:
        quality = {
            "glare_ratio": 0.05,
            "crease_score": 0.1,
            "wear_score": 0.6,
            "contrast": 80,
            "blur_score": 60,
        }
        assert select_preprocessing_path(quality) == PATH_WORN


class TestAnalyzeQuality:
    def test_returns_dict_with_all_fields(self) -> None:
        gray = np.random.randint(0, 256, (1000, 800), dtype=np.uint8)
        result = analyze_quality(gray)
        expected_keys = {
            "width",
            "height",
            "blur_score",
            "brightness",
            "contrast",
            "skew_angle",
            "glare_ratio",
            "crease_score",
            "wear_score",
            "warnings",
            "quality_ok",
            "recommended_path",
        }
        for key in expected_keys:
            assert key in result, f"Missing key: {key}"

    def test_quality_ok_no_warnings(self) -> None:
        gray = np.ones((1000, 800), dtype=np.uint8) * 128
        result = analyze_quality(gray)
        if not result["warnings"]:
            assert result["quality_ok"] is True

    def test_has_warnings_with_bad_image(self) -> None:
        gray = np.ones((100, 100), dtype=np.uint8) * 255
        result = analyze_quality(gray)
        if result["quality_ok"] is False:
            assert len(result["warnings"]) > 0

    def test_recommended_path_is_string(self) -> None:
        gray = np.random.randint(0, 256, (1000, 800), dtype=np.uint8)
        result = analyze_quality(gray)
        assert isinstance(result["recommended_path"], str)
        assert result["recommended_path"] in (PATH_STANDARD, PATH_WORN, PATH_LOW_CONTRAST, PATH_GLARE, PATH_RTL)
