import { imageDataToGrayscale, getPixel } from "./image_utils";

export interface QualityMetrics {
  blurScore: number;
  glareRatio: number;
  brightness: number;
  contrastScore: number;
}

export interface RetakeWarning {
  reason: string;
  details: string;
  severity: "warning" | "critical";
}

const BLUR_THRESHOLD = 50;
const GLARE_THRESHOLD = 0.15;
const BRIGHTNESS_MIN = 50;
const BRIGHTNESS_MAX = 220;
const CONTRAST_MIN = 30;

export function detectBlur(imageData: ImageData): number {
  const gray = imageDataToGrayscale(imageData);
  const { width, height } = imageData;

  const laplacian: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const val =
        -1 * getPixel(gray, width, x - 1, y) +
        -1 * getPixel(gray, width, x, y - 1) +
        4 * getPixel(gray, width, x, y) +
        -1 * getPixel(gray, width, x + 1, y) +
        -1 * getPixel(gray, width, x, y + 1);
      laplacian.push(val);
    }
  }

  const mean = laplacian.reduce((s, v) => s + v, 0) / laplacian.length;
  const variance = laplacian.reduce((s, v) => s + (v - mean) * (v - mean), 0) / laplacian.length;

  return variance;
}

export function detectGlare(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const glareThreshold = 240;
  let glarePixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (data[idx]! > glareThreshold && data[idx + 1]! > glareThreshold && data[idx + 2]! > glareThreshold) {
      glarePixels++;
    }
  }

  return glarePixels / totalPixels;
}

export function analyzeQuality(imageData: ImageData): QualityMetrics {
  const blurScore = detectBlur(imageData);
  const glareRatio = detectGlare(imageData);
  const gray = imageDataToGrayscale(imageData);
  const totalPixels = imageData.width * imageData.height;
  let sumBrightness = 0;
  let minGray = 255;
  let maxGray = 0;

  for (let i = 0; i < totalPixels; i++) {
    const v = gray[i]!;
    sumBrightness += v;
    if (v < minGray) minGray = v;
    if (v > maxGray) maxGray = v;
  }

  const brightness = sumBrightness / totalPixels;
  const contrastScore = maxGray - minGray;

  return { blurScore, glareRatio, brightness, contrastScore };
}

export function getRetakeWarning(quality: QualityMetrics): RetakeWarning | null {
  const warnings: RetakeWarning[] = [];

  if (quality.blurScore < BLUR_THRESHOLD) {
    warnings.push({
      reason: "Blurry image detected",
      details: `Blur score ${quality.blurScore.toFixed(1)} is below threshold ${BLUR_THRESHOLD}. Ensure the document is in focus and the camera is steady.`,
      severity: quality.blurScore < BLUR_THRESHOLD * 0.5 ? "critical" : "warning",
    });
  }

  if (quality.glareRatio > GLARE_THRESHOLD) {
    warnings.push({
      reason: "Glare detected on document",
      details: `Glare ratio ${(quality.glareRatio * 100).toFixed(1)}% exceeds threshold ${(GLARE_THRESHOLD * 100).toFixed(0)}%. Avoid direct light sources and angle the document away from bright lights.`,
      severity: quality.glareRatio > GLARE_THRESHOLD * 2 ? "critical" : "warning",
    });
  }

  if (quality.brightness < BRIGHTNESS_MIN) {
    warnings.push({
      reason: "Image too dark",
      details: `Brightness ${quality.brightness.toFixed(1)} is below minimum ${BRIGHTNESS_MIN}. Increase lighting or use flash.`,
      severity: quality.brightness < BRIGHTNESS_MIN * 0.5 ? "critical" : "warning",
    });
  }

  if (quality.brightness > BRIGHTNESS_MAX) {
    warnings.push({
      reason: "Image too bright",
      details: `Brightness ${quality.brightness.toFixed(1)} exceeds maximum ${BRIGHTNESS_MAX}. Reduce lighting or move away from direct light.`,
      severity: quality.brightness > BRIGHTNESS_MAX * 1.2 ? "critical" : "warning",
    });
  }

  if (quality.contrastScore < CONTRAST_MIN) {
    warnings.push({
      reason: "Low contrast image",
      details: `Contrast score ${quality.contrastScore.toFixed(1)} is below threshold ${CONTRAST_MIN}. Ensure even lighting on the document.`,
      severity: "warning",
    });
  }

  if (warnings.length === 0) return null;

  warnings.sort((a, b) => {
    const order = { critical: 0, warning: 1 };
    return order[a.severity] - order[b.severity];
  });

  return warnings[0]!;
}
