import { isTauri } from "../lib/isTauri";
import { invokeIpc } from "../infra/ipc";
import { logger } from "../lib/logger";

export type ImageInput = {
  imagePath: string;
};

export type QualityStatus = "PASSED" | "NEED_REVIEW" | "FAILED";

export type ImageQualityMetrics = {
  blurScore: number;
  brightness: number;
  contrast: number;
  glareRatio: number;
  skewAngle: number;
  width: number;
  height: number;
  edgeVisibilityScore: number;
  overexposureRatio: number;
  mrzCutoffScore: number;
  creaseScore: number;
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

export type OcrWarning =
  | "BLUR_DETECTED"
  | "GLARE_DETECTED"
  | "LOW_RESOLUTION"
  | "DOCUMENT_NOT_FULLY_VISIBLE"
  | "MRZ_NOT_FOUND"
  | "MRZ_CUT_OFF"
  | "MRZ_REPAIRED"
  | "MRZ_CHECK_DIGIT_FAILED"
  | "PASSPORT_NUMBER_REPAIRED"
  | "DOB_REPAIRED"
  | "EXPIRY_REPAIRED"
  | "COUNTRY_CODE_REPAIRED"
  | "VISUAL_MRZ_CONFLICT"
  | "CREASE_DETECTED"
  | "LOW_BRIGHTNESS"
  | "OVEREXPOSED"
  | "STRONG_ROTATION"
  | "PERSPECTIVE_DISTORTION"
  | "LOW_CONFIDENCE_FIELD"
  | "HUMAN_REVIEW_REQUIRED";

export function qualityWarningToOcrWarning(warning: ImageQualityWarning): OcrWarning {
  const map: Record<ImageQualityWarning, OcrWarning> = {
    BLURRY: "BLUR_DETECTED",
    TOO_DARK: "LOW_BRIGHTNESS",
    TOO_BRIGHT: "OVEREXPOSED",
    LOW_CONTRAST: "BLUR_DETECTED",
    GLARE_DETECTED: "GLARE_DETECTED",
    SKEWED: "STRONG_ROTATION",
    LOW_RESOLUTION: "LOW_RESOLUTION",
    EDGES_NOT_VISIBLE: "DOCUMENT_NOT_FULLY_VISIBLE",
  };
  return map[warning];
}

export type ImageQualityResult = {
  metrics: ImageQualityMetrics;
  warnings: ImageQualityWarning[];
  ocrWarnings: OcrWarning[];
  passed: boolean;
  status: QualityStatus;
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
const OVEREXPOSURE_THRESHOLD = 0.1;
const MRZ_CUTOFF_THRESHOLD = 0.3;
const CREASE_THRESHOLD = 0.5;

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

function evaluateOcrWarnings(metrics: ImageQualityMetrics, imageQualityWarnings: ImageQualityWarning[]): OcrWarning[] {
  const ocrWarnings: OcrWarning[] = imageQualityWarnings.map(qualityWarningToOcrWarning);

  if (metrics.overexposureRatio > OVEREXPOSURE_THRESHOLD && !ocrWarnings.includes("OVEREXPOSED")) {
    ocrWarnings.push("OVEREXPOSED");
  }
  if (metrics.mrzCutoffScore < MRZ_CUTOFF_THRESHOLD) {
    ocrWarnings.push("MRZ_CUT_OFF");
  }
  if (metrics.creaseScore > CREASE_THRESHOLD) {
    ocrWarnings.push("CREASE_DETECTED");
  }

  return ocrWarnings;
}

function determineStatus(warnings: ImageQualityWarning[]): QualityStatus {
  if (warnings.length === 0) return "PASSED";
  const criticalWarnings: ImageQualityWarning[] = ["BLURRY", "EDGES_NOT_VISIBLE"];
  const hasCritical = warnings.some((w) => criticalWarnings.includes(w));
  if (hasCritical && warnings.length >= 3) return "FAILED";
  return "NEED_REVIEW";
}

export function createImageQualityService(): ImageQualityService {
  if (isTauri()) {
    return new TauriImageQualityService();
  }
  if (typeof Image !== "undefined" && typeof HTMLCanvasElement !== "undefined") {
    logger.debug("ImageQualityService: using browser-based local analysis");
    return new BrowserImageQualityService();
  }
  logger.debug("ImageQualityService: not in browser context, using mock implementation");
  return new MockImageQualityService();
}

class TauriImageQualityService implements ImageQualityService {
  async analyzeImage(input: ImageInput): Promise<ImageQualityResult> {
    logger.debug("ImageQualityService: analyzing image", { imagePath: input.imagePath });

    try {
      const raw = await invokeIpc<{
        blurScore: number;
        brightness: number;
        contrast: number;
        glareRatio: number;
        skewAngle: number;
        width: number;
        height: number;
        edgeVisibilityScore: number;
        overexposureRatio: number;
        mrzCutoffScore: number;
        creaseScore: number;
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
        overexposureRatio: raw.overexposureRatio ?? 0,
        mrzCutoffScore: raw.mrzCutoffScore ?? 1,
        creaseScore: raw.creaseScore ?? 0,
      };

      const warnings = evaluateWarnings(metrics);
      const ocrWarnings = evaluateOcrWarnings(metrics, warnings);

      return {
        metrics,
        warnings,
        ocrWarnings,
        passed: warnings.length === 0,
        status: determineStatus(warnings),
      };
    } catch (error) {
      logger.error("ImageQualityService: analysis failed", error);
      throw error;
    }
  }
}

class BrowserImageQualityService implements ImageQualityService {
  async analyzeImage(input: ImageInput): Promise<ImageQualityResult> {
    logger.debug("ImageQualityService (browser): analyzing image", { imagePath: input.imagePath });

    const imageData = await loadImageData(input.imagePath);

    const metrics = this.computeMetrics(imageData);

    const warnings = evaluateWarnings(metrics);
    const ocrWarnings = evaluateOcrWarnings(metrics, warnings);

    logger.debug("ImageQualityService (browser): quality result", {
      passed: warnings.length === 0,
      warnings,
      blurScore: metrics.blurScore.toFixed(2),
      glareRatio: metrics.glareRatio.toFixed(4),
      brightness: metrics.brightness.toFixed(1),
    });

    return {
      metrics,
      warnings,
      ocrWarnings,
      passed: warnings.length === 0,
      status: determineStatus(warnings),
    };
  }

  private computeMetrics(imageData: ImageData): ImageQualityMetrics {
    const blurScore = this.detectBlur(imageData);
    const glareRatio = this.detectGlare(imageData);
    const brightness = this.computeBrightness(imageData);
    const overexposureRatio = this.detectOverexposure(imageData);
    const contrast = this.computeContrast(imageData);
    const skewAngle = this.estimateSkewAngle(imageData);
    const edgeVisibilityScore = this.detectEdgeVisibility(imageData);
    const mrzCutoffScore = this.detectMrzCutoff(imageData);
    const creaseScore = this.detectCreases(imageData);

    return {
      blurScore,
      brightness,
      contrast,
      glareRatio,
      skewAngle,
      width: imageData.width,
      height: imageData.height,
      edgeVisibilityScore,
      overexposureRatio,
      mrzCutoffScore,
      creaseScore,
    };
  }

  private toGrayscale(imageData: ImageData): Float64Array {
    const { data, width, height } = imageData;
    const gray = new Float64Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
    }
    return gray;
  }

  private getPixel(data: Float64Array | Uint8ClampedArray, width: number, x: number, y: number): number {
    return data[y * width + x]!;
  }

  private detectBlur(imageData: ImageData): number {
    const gray = this.toGrayscale(imageData);
    const { width, height } = imageData;

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const val =
          -1 * this.getPixel(gray, width, x - 1, y) +
          -1 * this.getPixel(gray, width, x, y - 1) +
          4 * this.getPixel(gray, width, x, y) +
          -1 * this.getPixel(gray, width, x + 1, y) +
          -1 * this.getPixel(gray, width, x, y + 1);
        sum += val;
        sumSq += val * val;
        count++;
      }
    }

    if (count === 0) return 0;

    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return variance;
  }

  private detectGlare(imageData: ImageData): number {
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

  private computeBrightness(imageData: ImageData): number {
    const gray = this.toGrayscale(imageData);
    const totalPixels = imageData.width * imageData.height;
    let sum = 0;
    for (let i = 0; i < totalPixels; i++) {
      sum += gray[i]!;
    }
    return sum / totalPixels;
  }

  private detectOverexposure(imageData: ImageData): number {
    const { data, width, height } = imageData;
    const totalPixels = width * height;
    const overexposedThreshold = 250;
    let overexposedPixels = 0;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      if (
        data[idx]! > overexposedThreshold &&
        data[idx + 1]! > overexposedThreshold &&
        data[idx + 2]! > overexposedThreshold
      ) {
        overexposedPixels++;
      }
    }

    return overexposedPixels / totalPixels;
  }

  private computeContrast(imageData: ImageData): number {
    const gray = this.toGrayscale(imageData);
    const totalPixels = imageData.width * imageData.height;
    let minGray = 255;
    let maxGray = 0;

    for (let i = 0; i < totalPixels; i++) {
      const v = gray[i]!;
      if (v < minGray) minGray = v;
      if (v > maxGray) maxGray = v;
    }

    return maxGray - minGray;
  }

  private estimateSkewAngle(imageData: ImageData): number {
    const gray = this.toGrayscale(imageData);
    const { width, height } = imageData;

    const edgeImage = new Float64Array(width * height);
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0;
        let sumY = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = this.getPixel(gray, width, x + kx, y + ky);
            const ki = (ky + 1) * 3 + (kx + 1);
            sumX += pixel * gx[ki]!;
            sumY += pixel * gy[ki]!;
          }
        }
        edgeImage[y * width + x] = Math.sqrt(sumX * sumX + sumY * sumY);
      }
    }

    const edgeThreshold = 100;
    const strongEdges: Array<{ x: number; y: number; angle: number }> = [];

    for (let y = 10; y < height - 10; y++) {
      for (let x = 10; x < width - 10; x++) {
        if (edgeImage[y * width + x]! > edgeThreshold) {
          let sumX = 0;
          let sumY = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixel = this.getPixel(gray, width, x + kx, y + ky);
              const ki = (ky + 1) * 3 + (kx + 1);
              sumX += pixel * gx[ki]!;
              sumY += pixel * gy[ki]!;
            }
          }
          if (Math.abs(sumX) > 1 || Math.abs(sumY) > 1) {
            const angle = Math.atan2(sumY, sumX) * (180 / Math.PI);
            strongEdges.push({ x, y, angle });
          }
        }
      }
    }

    if (strongEdges.length < 50) return 0;

    const angleHistogram = new Float64Array(180);
    for (const edge of strongEdges) {
      const bin = Math.round(((edge.angle % 180) + 180) % 180);
      angleHistogram[bin]!++;
    }

    let maxBin = 0;
    let maxCount = 0;
    for (let i = 0; i < 180; i++) {
      if (angleHistogram[i]! > maxCount) {
        maxCount = angleHistogram[i]!;
        maxBin = i;
      }
    }

    const dominantAngle = maxBin;
    const skewDeg = dominantAngle > 90 ? dominantAngle - 180 : dominantAngle;
    return Math.abs(skewDeg) > 45 ? 0 : skewDeg;
  }

  private detectEdgeVisibility(imageData: ImageData): number {
    const { width, height } = imageData;
    const gray = this.toGrayscale(imageData);

    const edgeImage = new Float64Array(width * height);
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0;
        let sumY = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = this.getPixel(gray, width, x + kx, y + ky);
            const ki = (ky + 1) * 3 + (kx + 1);
            sumX += pixel * gx[ki]!;
            sumY += pixel * gy[ki]!;
          }
        }
        edgeImage[y * width + x] = Math.sqrt(sumX * sumX + sumY * sumY);
      }
    }

    const edgeThreshold = 80;
    const marginRatio = 0.05;
    const marginW = Math.floor(width * marginRatio);
    const marginH = Math.floor(height * marginRatio);

    let edgePixels = 0;
    let totalBorderPixels = 0;

    const scanBorder = (x1: number, y1: number, x2: number, y2: number, step: number) => {
      for (let y = y1; y <= y2; y += step) {
        for (let x = x1; x <= x2; x += step) {
          totalBorderPixels++;
          if (edgeImage[y * width + x]! > edgeThreshold) {
            edgePixels++;
          }
        }
      }
    };

    scanBorder(0, 0, width - 1, marginH, 2);
    scanBorder(0, height - 1 - marginH, width - 1, height - 1, 2);
    scanBorder(0, marginH, marginW, height - 1 - marginH, 2);
    scanBorder(width - 1 - marginW, marginH, width - 1, height - 1 - marginH, 2);

    if (totalBorderPixels === 0) return 0;
    return edgePixels / totalBorderPixels;
  }

  private detectMrzCutoff(imageData: ImageData): number {
    const { width, height } = imageData;
    const gray = this.toGrayscale(imageData);

    const mrzRegionHeight = Math.floor(height * 0.2);
    const mrzStartY = height - mrzRegionHeight;

    let mrzEdgeCount = 0;
    let mrzTotalPixels = 0;

    for (let y = mrzStartY; y < height; y++) {
      for (let x = 2; x < width - 2; x++) {
        const left = this.getPixel(gray, width, x - 2, y);
        const right = this.getPixel(gray, width, x + 2, y);
        if (Math.abs(left - right) > 40) {
          mrzEdgeCount++;
        }
        mrzTotalPixels++;
      }
    }

    if (mrzTotalPixels === 0) return 0;

    const globalEdgeThreshold = 0.05;
    const mrzEdgeRatio = mrzEdgeCount / mrzTotalPixels;

    if (mrzEdgeRatio < globalEdgeThreshold) {
      return mrzEdgeRatio / globalEdgeThreshold;
    }

    return Math.min(mrzEdgeRatio / globalEdgeThreshold, 1.5);
  }

  private detectCreases(imageData: ImageData): number {
    const gray = this.toGrayscale(imageData);
    const { width, height } = imageData;

    const edgeImage = new Float64Array(width * height);
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0;
        let sumY = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = this.getPixel(gray, width, x + kx, y + ky);
            const ki = (ky + 1) * 3 + (kx + 1);
            sumX += pixel * gx[ki]!;
            sumY += pixel * gy[ki]!;
          }
        }
        edgeImage[y * width + x] = Math.sqrt(sumX * sumX + sumY * sumY);
      }
    }

    const edgeThreshold = 150;
    const minCreaseLength = Math.floor(Math.min(width, height) * 0.4);
    let horizontalCreases = 0;
    let verticalCreases = 0;

    for (let y = 0; y < height; y++) {
      let runLength = 0;
      for (let x = 0; x < width; x++) {
        if (edgeImage[y * width + x]! > edgeThreshold) {
          runLength++;
        } else {
          if (runLength >= minCreaseLength) horizontalCreases++;
          runLength = 0;
        }
      }
      if (runLength >= minCreaseLength) horizontalCreases++;
    }

    for (let x = 0; x < width; x++) {
      let runLength = 0;
      for (let y = 0; y < height; y++) {
        if (edgeImage[y * width + x]! > edgeThreshold) {
          runLength++;
        } else {
          if (runLength >= minCreaseLength) verticalCreases++;
          runLength = 0;
        }
      }
      if (runLength >= minCreaseLength) verticalCreases++;
    }

    const totalCreases = horizontalCreases + verticalCreases;
    return Math.min(totalCreases / 3, 1);
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
      overexposureRatio: 0,
      mrzCutoffScore: 1,
      creaseScore: 0,
    };

    const warnings = evaluateWarnings(metrics);
    const ocrWarnings = evaluateOcrWarnings(metrics, warnings);

    return {
      metrics,
      warnings,
      ocrWarnings,
      passed: warnings.length === 0,
      status: determineStatus(warnings),
    };
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function loadImageData(imagePath: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas 2D context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
    img.src = imagePath;
  });
}
