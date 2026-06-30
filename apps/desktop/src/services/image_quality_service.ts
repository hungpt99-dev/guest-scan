import { isTauri, requireTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";

export type ImageInput = {
  imagePath: string;
};

export type ImageQualityMetrics = {
  blurScore: number;
  brightness: number;
  contrast: number;
  glareRatio: number;
  skewAngle: number;
  width: number;
  height: number;
  edgeVisibilityScore: number;
};

export type ImageQualityWarning =
  | "BLURRY"
  | "TOO_DARK"
  | "TOO_BRIGHT"
  | "LOW_CONTRAST"
  | "GLARE_DETECTED"
  | "SKEWED"
  | "LOW_RESOLUTION"
  | "EDGES_NOT_VISIBLE";

export type ImageQualityResult = {
  metrics: ImageQualityMetrics;
  warnings: ImageQualityWarning[];
  passed: boolean;
};

export interface ImageQualityService {
  analyzeImage(input: ImageInput): Promise<ImageQualityResult>;
}

const PASSPORT_MIN_WIDTH = 800;
const PASSPORT_MIN_HEIGHT = 600;
const BLUR_THRESHOLD = 50;
const BRIGHTNESS_MIN = 50;
const BRIGHTNESS_MAX = 220;
const CONTRAST_MIN = 30;
const SKEW_THRESHOLD = 5;
const GLARE_THRESHOLD = 0.15;
const EDGE_VISIBILITY_THRESHOLD = 0.3;

function evaluateWarnings(metrics: ImageQualityMetrics): ImageQualityWarning[] {
  const warnings: ImageQualityWarning[] = [];

  if (metrics.blurScore < BLUR_THRESHOLD) warnings.push("BLURRY");
  if (metrics.brightness < BRIGHTNESS_MIN) warnings.push("TOO_DARK");
  else if (metrics.brightness > BRIGHTNESS_MAX) warnings.push("TOO_BRIGHT");
  if (metrics.contrast < CONTRAST_MIN) warnings.push("LOW_CONTRAST");
  if (metrics.glareRatio > GLARE_THRESHOLD) warnings.push("GLARE_DETECTED");
  if (Math.abs(metrics.skewAngle) > SKEW_THRESHOLD) warnings.push("SKEWED");
  if (metrics.width < PASSPORT_MIN_WIDTH || metrics.height < PASSPORT_MIN_HEIGHT) warnings.push("LOW_RESOLUTION");
  if (metrics.edgeVisibilityScore < EDGE_VISIBILITY_THRESHOLD) warnings.push("EDGES_NOT_VISIBLE");

  return warnings;
}

export function createImageQualityService(): ImageQualityService {
  if (isTauri()) {
    return new TauriImageQualityService();
  }
  logger.debug("ImageQualityService: not in Tauri context, using mock implementation");
  return new MockImageQualityService();
}

class TauriImageQualityService implements ImageQualityService {
  async analyzeImage(input: ImageInput): Promise<ImageQualityResult> {
    await requireTauri();

    logger.debug("ImageQualityService: analyzing image", { imagePath: input.imagePath });

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");

      const raw = await invoke<{
        blurScore: number;
        brightness: number;
        contrast: number;
        glareRatio: number;
        skewAngle: number;
        width: number;
        height: number;
        edgeVisibilityScore: number;
      }>("analyze_image_quality", { imagePath: input.imagePath });

      const metrics: ImageQualityMetrics = {
        blurScore: raw.blurScore,
        brightness: raw.brightness,
        contrast: raw.contrast,
        glareRatio: raw.glareRatio,
        skewAngle: raw.skewAngle,
        width: raw.width,
        height: raw.height,
        edgeVisibilityScore: raw.edgeVisibilityScore,
      };

      const warnings = evaluateWarnings(metrics);

      return {
        metrics,
        warnings,
        passed: warnings.length === 0,
      };
    } catch (error) {
      logger.error("ImageQualityService: analysis failed", error);
      throw error;
    }
  }
}

class MockImageQualityService implements ImageQualityService {
  async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
    logger.debug("ImageQualityService (mock): returning simulated quality metrics");

    await this.simulateProcessing();

    const metrics: ImageQualityMetrics = {
      blurScore: 85.0,
      brightness: 128.0,
      contrast: 55.0,
      glareRatio: 0.02,
      skewAngle: 1.5,
      width: 1200,
      height: 900,
      edgeVisibilityScore: 0.85,
    };

    const warnings = evaluateWarnings(metrics);

    return {
      metrics,
      warnings,
      passed: warnings.length === 0,
    };
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
