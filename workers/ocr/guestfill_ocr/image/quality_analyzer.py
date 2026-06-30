"""Analyze image quality metrics with enhanced detection.

Adds crease detection, wear detection, and glare segmentation
for adaptive preprocessing selection.
"""

import cv2
import numpy as np

# Preprocessing path constants
PATH_STANDARD = "standard"
PATH_WORN = "worn_creased"
PATH_LOW_CONTRAST = "low_contrast"
PATH_GLARE = "glare"
PATH_RTL = "rtl"


def calculate_blur_score(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def calculate_brightness(gray: np.ndarray) -> float:
    return float(gray.mean())


def calculate_contrast(gray: np.ndarray) -> float:
    return float(gray.std())


def estimate_skew_angle(gray: np.ndarray) -> float:
    try:
        coords = np.column_stack(np.where(gray > 128))
        if len(coords) < 100:
            return 0.0
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        return float(angle)
    except Exception:
        return 0.0


def estimate_glare(gray: np.ndarray) -> float:
    h, w = gray.shape
    top_percentile = float(np.percentile(gray, 98))
    if top_percentile > 240:
        bright_pixels = float(np.sum(gray > 240))
        total_pixels = float(h * w)
        return bright_pixels / total_pixels
    return 0.0


def estimate_crease(gray: np.ndarray) -> float:
    edges = cv2.Canny(gray, 30, 100, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=80,
        minLineLength=30,
        maxLineGap=10,
    )
    if lines is None:
        return 0.0
    h, w = gray.shape[:2]
    diag = np.sqrt(w**2 + h**2)
    intersection_score = 0.0
    for i in range(len(lines)):
        for j in range(i + 1, min(i + 20, len(lines))):
            x1, y1, x2, y2 = lines[i][0]
            x3, y3, x4, y4 = lines[j][0]
            angle1 = abs(np.arctan2(y2 - y1, x2 - x1))
            angle2 = abs(np.arctan2(y4 - y3, x4 - x3))
            angle_diff = abs(angle1 - angle2) * 180 / np.pi
            if 10 < angle_diff < 170:
                intersection_score += 1.0
    return min(1.0, intersection_score / max(diag, 1))


def estimate_wear(gray: np.ndarray) -> float:
    h, w = gray.shape[:2]
    grid_rows, grid_cols = 8, 8
    cell_h, cell_w = h // grid_rows, w // grid_cols
    local_stds: list[float] = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            y1, y2 = r * cell_h, min((r + 1) * cell_h, h)
            x1, x2 = c * cell_w, min((c + 1) * cell_w, w)
            cell = gray[y1:y2, x1:x2]
            if cell.size > 0:
                local_stds.append(float(cell.std()))
    if not local_stds:
        return 0.0
    std_of_stds = float(np.std(local_stds))
    return min(1.0, std_of_stds / 50.0)


def estimate_edge_visibility(gray: np.ndarray) -> float:
    try:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        h, w = gray.shape[:2]
        total_pixels = h * w
        edge_pixels = float(np.count_nonzero(edges))
        if edge_pixels < max(total_pixels * 0.001, 100):
            return 0.0
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return edge_pixels / total_pixels * 0.5
        largest = max(contours, key=cv2.contourArea)
        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
        area = float(cv2.contourArea(largest))
        image_area = float(h * w)
        area_ratio = area / image_area
        if len(approx) == 4:
            return min(1.0, area_ratio * 2.0)
        is_rectangular = min(1.0, len(approx) / 4.0)
        return min(1.0, (edge_pixels / total_pixels) * 10.0 * is_rectangular)
    except Exception:
        return 0.0


def select_preprocessing_path(quality: dict) -> str:
    if quality.get("glare_ratio", 0) > 0.15:
        return PATH_GLARE
    if quality.get("crease_score", 0) > 0.3:
        return PATH_WORN
    if quality.get("wear_score", 0) > 0.4:
        return PATH_WORN
    if quality.get("contrast", 100) < 30:
        return PATH_LOW_CONTRAST
    if quality.get("blur_score", 100) < 30:
        return PATH_WORN
    return PATH_STANDARD


def analyze_quality(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    blur = calculate_blur_score(gray)
    brightness = calculate_brightness(gray)
    contrast = calculate_contrast(gray)
    skew = estimate_skew_angle(gray)
    glare = estimate_glare(gray)
    crease = estimate_crease(gray)
    wear = estimate_wear(gray)
    edge_visibility = estimate_edge_visibility(gray)

    warnings: list[str] = []
    if blur < 50:
        warnings.append("LOW_IMAGE_SHARPNESS")
    if brightness < 50:
        warnings.append("IMAGE_TOO_DARK")
    elif brightness > 220:
        warnings.append("IMAGE_TOO_BRIGHT")
    if contrast < 30:
        warnings.append("LOW_CONTRAST")
    if abs(skew) > 5:
        warnings.append("IMAGE_SKEWED")
    if glare > 0.15:
        warnings.append("GLARE_DETECTED")
    if w < 600 or h < 450:
        warnings.append("LOW_RESOLUTION")
    if crease > 0.6:
        warnings.append("CREASE_DETECTED")
    if wear > 0.5:
        warnings.append("WEAR_DETECTED")
    if edge_visibility < 0.3:
        warnings.append("EDGES_NOT_VISIBLE")

    recommended_path = select_preprocessing_path(
        {
            "contrast": contrast,
            "blur_score": blur,
            "glare_ratio": glare,
            "crease_score": crease,
            "wear_score": wear,
        }
    )

    return {
        "width": w,
        "height": h,
        "blur_score": round(blur, 2),
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "skew_angle": round(skew, 2),
        "glare_ratio": round(glare, 4),
        "edge_visibility": round(edge_visibility, 4),
        "crease_score": round(crease, 4),
        "wear_score": round(wear, 4),
        "warnings": warnings,
        "quality_ok": len(warnings) == 0,
        "recommended_path": recommended_path,
    }
