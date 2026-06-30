import { isTauri, requireTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";
import type { PreprocessedImage } from "./image_preprocessing_service";
import {
  MRZ_BOTTOM_PORTION_START,
  MRZ_MIN_HEIGHT_RATIO,
  MRZ_MAX_HEIGHT_RATIO,
  MRZ_MIN_LINE_HEIGHT_PX,
  TEXT_DENSITY_THRESHOLD,
  PROJECTION_SMOOTH_WINDOW,
  LINE_DETECTION_THRESHOLD,
  DARK_LUMINANCE_THRESHOLD,
  JPEG_SAVE_QUALITY,
  MOCK_MRZ_VERTICAL_OFFSET,
  MOCK_MRZ_FIXED_WIDTH,
  MOCK_MRZ_DELAY_MS,
  BAND_DENSITY_DIFF_THRESHOLD,
  MRZ_CONFIDENCE_TD1,
  MRZ_CONFIDENCE_TD2_TD3,
  MRZ_CONFIDENCE_UNKNOWN,
  MRZ_ASPECT_RATIO_THRESHOLD,
} from "../config/constants";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MrzRegion = {
  imagePath: string;
  width: number;
  height: number;
  boundingBox: BoundingBox;
  /** @deprecated Use boundingBox.x */
  x: number;
  /** @deprecated Use boundingBox.y */
  y: number;
  detectedFormat: "TD1" | "TD2" | "TD3" | "UNKNOWN";
  confidence: number;
  lineCount: number;
};

export type MrzDetectionError = "MRZ_NOT_FOUND" | "MRZ_DETECTION_FAILED" | "IMAGE_LOAD_FAILED";

export interface MrzDetectionService {
  detectMrzRegion(image: PreprocessedImage): Promise<MrzRegion>;
}



export type TextBand = {
  startY: number;
  endY: number;
  peakDensity: number;
};

export type MrzFormatInfo = {
  format: MrzRegion["detectedFormat"];
  confidence: number;
  lineCount: number;
};

/**
 * Compute horizontal projection profile from raw RGBA pixel data.
 * Returns an array where each element represents the proportion of dark pixels
 * (luminance < 128) in that row, normalized by row width.
 */
export function computeHorizontalProjection(pixels: Uint8Array, width: number, height: number): Float64Array {
  const projection = new Float64Array(height);

  for (let y = 0; y < height; y++) {
    let darkPixels = 0;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance < DARK_LUMINANCE_THRESHOLD) darkPixels++;
    }
    projection[y] = darkPixels / width;
  }

  return projection;
}

/**
 * Smooth a projection array using a moving average window.
 * Smaller values in `windowSize` produce less smoothing.
 */
export function smoothProjection(projection: Float64Array, windowSize: number): Float64Array {
  const smoothed = new Float64Array(projection.length);
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < projection.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - half);
    const end = Math.min(projection.length - 1, i + half);
    for (let j = start; j <= end; j++) {
      sum += projection[j] ?? 0;
      count++;
    }
    smoothed[i] = count > 0 ? sum / count : 0;
  }

  return smoothed;
}

/**
 * Find contiguous bands of rows where the projection value exceeds the threshold.
 * Bands shorter than 2 rows are discarded as noise.
 */
export function findTextBands(projection: Float64Array, threshold: number): TextBand[] {
  const bands: TextBand[] = [];
  let inBand = false;
  let bandStart = 0;
  let peakDensity = 0;
  let bandCount = 0;

  for (let y = 0; y < projection.length; y++) {
    const density = projection[y] ?? 0;
    if (density >= threshold) {
      if (!inBand) {
        bandStart = y;
        peakDensity = density;
        bandCount = 1;
        inBand = true;
      } else {
        if (density > peakDensity) peakDensity = density;
        bandCount++;
      }
    } else {
      if (inBand) {
        if (bandCount >= 2) {
          bands.push({ startY: bandStart, endY: y - 1, peakDensity });
        }
        inBand = false;
      }
    }
  }

  if (inBand && bandCount >= 2) {
    bands.push({
      startY: bandStart,
      endY: projection.length - 1,
      peakDensity,
    });
  }

  return bands;
}

/**
 * Select the best MRZ band from candidate text bands.
 *
 * MRZ is typically in the bottom third of the document and forms a dense
 * horizontal band. This function filters bands in the expected location
 * and picks the one with the highest text density, preferring bottom-most.
 */
export function selectMrzBand(
  bands: TextBand[],
  imageHeight: number,
  minHeightRatio: number,
  maxHeightRatio: number,
): TextBand | null {
  if (bands.length === 0) return null;

  const searchStart = Math.floor(imageHeight * MRZ_BOTTOM_PORTION_START);

  const candidates = bands.filter((b) => {
    const height = b.endY - b.startY + 1;
    const minH = imageHeight * minHeightRatio;
    const maxH = imageHeight * maxHeightRatio;
    return b.startY >= searchStart && height >= minH && height <= maxH;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const densityDiff = b.peakDensity - a.peakDensity;
    if (Math.abs(densityDiff) > BAND_DENSITY_DIFF_THRESHOLD) return densityDiff > 0 ? 1 : -1;
    return b.startY - a.startY;
  });

  return candidates[0] ?? null;
}

/**
 * Estimate the number of text lines within a band by counting rows with
 * density above a threshold. This is used to distinguish TD1 (3 lines)
 * from TD2/TD3 (2 lines).
 */
export function estimateLineCount(
  projection: Float64Array,
  bandStart: number,
  bandEnd: number,
  threshold: number,
  minLineHeight: number,
): number {
  const localProj = projection.slice(bandStart, bandEnd + 1);
  const smoothed = smoothProjection(localProj, PROJECTION_SMOOTH_WINDOW);

  let lineCount = 0;
  let inLine = false;
  let lineStart = 0;

  for (let y = 0; y < smoothed.length; y++) {
    if ((smoothed[y] ?? 0) >= threshold) {
      if (!inLine) {
        lineStart = y;
        inLine = true;
      }
    } else {
      if (inLine && y - lineStart >= minLineHeight) {
        lineCount++;
        inLine = false;
      } else if (inLine) {
        inLine = false;
      }
    }
  }

  if (inLine && smoothed.length - lineStart >= minLineHeight) {
    lineCount++;
  }

  return lineCount;
}

/**
 * Detect MRZ format based on the number of text lines and band height ratio.
 *
 * - TD1: 3 lines (ID cards, ~30 chars per line)
 * - TD2: 2 lines with larger band height (visa-style, ~36 chars per line)
 * - TD3: 2 lines with smaller band height (passports, ~44 chars per line)
 */
export function detectMrzFormat(lineCount: number, bandHeight: number, imageHeight: number): MrzFormatInfo {
  if (lineCount >= 3) {
    return { format: "TD1", confidence: MRZ_CONFIDENCE_TD1, lineCount };
  }

  if (lineCount === 2) {
    const aspectRatio = bandHeight / imageHeight;
    return {
      format: aspectRatio > MRZ_ASPECT_RATIO_THRESHOLD ? "TD2" : "TD3",
      confidence: MRZ_CONFIDENCE_TD2_TD3,
      lineCount: 2,
    };
  }

  return { format: "UNKNOWN", confidence: MRZ_CONFIDENCE_UNKNOWN, lineCount };
}

function createMrzRegion(
  imagePath: string,
  width: number,
  height: number,
  y: number,
  formatInfo: MrzFormatInfo,
): MrzRegion {
  return {
    imagePath,
    width,
    height,
    boundingBox: { x: 0, y, width, height },
    x: 0,
    y,
    detectedFormat: formatInfo.format,
    confidence: formatInfo.confidence,
    lineCount: formatInfo.lineCount,
  };
}

export function createMrzDetectionService(): MrzDetectionService {
  if (isTauri()) {
    logger.debug("MrzDetectionService: using Tauri implementation");
    return new TauriMrzDetectionService();
  }

  try {
    if (typeof document !== "undefined" && typeof document.createElement !== "undefined") {
      logger.debug("MrzDetectionService: using heuristic implementation");
      return new HeuristicMrzDetectionService();
    }
  } catch {
    // Not in a browser-like environment
  }

  logger.debug("MrzDetectionService: not in Tauri or browser context, using mock implementation");
  return new MockMrzDetectionService();
}

class TauriMrzDetectionService implements MrzDetectionService {
  async detectMrzRegion(image: PreprocessedImage): Promise<MrzRegion> {
    await requireTauri();

    logger.debug("TauriMrzDetectionService: detecting MRZ region", {
      imagePath: image.imagePath,
    });

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");

      const raw = await invoke<{
        croppedPath: string;
        width: number;
        height: number;
        x: number;
        y: number;
        detectedFormat: string;
        confidence: number;
        lineCount: number;
      }>("detect_mrz_region", { imagePath: image.imagePath });

      return {
        imagePath: raw.croppedPath,
        width: raw.width,
        height: raw.height,
        boundingBox: {
          x: raw.x,
          y: raw.y,
          width: raw.width,
          height: raw.height,
        },
        x: raw.x,
        y: raw.y,
        detectedFormat: raw.detectedFormat as MrzRegion["detectedFormat"],
        confidence: raw.confidence,
        lineCount: raw.lineCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("MRZ_NOT_FOUND")) {
        logger.warn("TauriMrzDetectionService: MRZ not found", {
          imagePath: image.imagePath,
        });
        throw Object.assign(new Error("MRZ_NOT_FOUND"), {
          type: "MRZ_NOT_FOUND" as MrzDetectionError,
        });
      }
      logger.error("TauriMrzDetectionService: detection failed", error);
      throw Object.assign(new Error("MRZ_DETECTION_FAILED"), {
        type: "MRZ_DETECTION_FAILED" as MrzDetectionError,
      });
    }
  }
}

class HeuristicMrzDetectionService implements MrzDetectionService {
  async detectMrzRegion(image: PreprocessedImage): Promise<MrzRegion> {
    logger.debug("HeuristicMrzDetectionService: detecting MRZ region", {
      imagePath: image.imagePath,
    });

    try {
      const canvas = document.createElement("canvas");
      const img = await this.loadImage(image.imagePath);

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw Object.assign(new Error("MRZ_DETECTION_FAILED"), {
          type: "MRZ_DETECTION_FAILED" as MrzDetectionError,
        });
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);

      const projection = computeHorizontalProjection(pixels, canvas.width, canvas.height);
      const smoothed = smoothProjection(projection, PROJECTION_SMOOTH_WINDOW);
      const bands = findTextBands(smoothed, TEXT_DENSITY_THRESHOLD);

      if (bands.length === 0) {
        logger.warn("HeuristicMrzDetectionService: no text bands found");
        throw Object.assign(new Error("MRZ_NOT_FOUND"), {
          type: "MRZ_NOT_FOUND" as MrzDetectionError,
        });
      }

      const mrzBand = selectMrzBand(bands, canvas.height, MRZ_MIN_HEIGHT_RATIO, MRZ_MAX_HEIGHT_RATIO);

      if (!mrzBand) {
        logger.warn("HeuristicMrzDetectionService: no valid MRZ band", {
          bandCount: bands.length,
        });
        throw Object.assign(new Error("MRZ_NOT_FOUND"), {
          type: "MRZ_NOT_FOUND" as MrzDetectionError,
        });
      }

      const lineCount = estimateLineCount(
        projection,
        mrzBand.startY,
        mrzBand.endY,
        LINE_DETECTION_THRESHOLD,
        MRZ_MIN_LINE_HEIGHT_PX,
      );

      const bandHeight = mrzBand.endY - mrzBand.startY + 1;
      const formatInfo = detectMrzFormat(lineCount, bandHeight, canvas.height);

      const mrzCanvas = document.createElement("canvas");
      const mrzWidth = canvas.width;
      const mrzHeight = bandHeight;
      mrzCanvas.width = mrzWidth;
      mrzCanvas.height = mrzHeight;
      const mrzCtx = mrzCanvas.getContext("2d");

      if (!mrzCtx) {
        throw Object.assign(new Error("MRZ_DETECTION_FAILED"), {
          type: "MRZ_DETECTION_FAILED" as MrzDetectionError,
        });
      }

      mrzCtx.drawImage(canvas, 0, mrzBand.startY, mrzWidth, mrzHeight, 0, 0, mrzWidth, mrzHeight);

      const mrzImagePath = await this.saveCroppedImage(mrzCanvas);

      return createMrzRegion(mrzImagePath, mrzWidth, mrzHeight, mrzBand.startY, formatInfo);
    } catch (error) {
      if (error instanceof Error && "type" in error) {
        throw error;
      }
      logger.error("HeuristicMrzDetectionService: detection failed", error);
      throw Object.assign(new Error("MRZ_DETECTION_FAILED"), {
        type: "MRZ_DETECTION_FAILED" as MrzDetectionError,
      });
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          Object.assign(new Error("IMAGE_LOAD_FAILED"), {
            type: "IMAGE_LOAD_FAILED" as MrzDetectionError,
          }),
        );
      img.src = src;
    });
  }

  private async saveCroppedImage(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_SAVE_QUALITY));
    if (!blob) {
      throw Object.assign(new Error("MRZ_DETECTION_FAILED"), {
        type: "MRZ_DETECTION_FAILED" as MrzDetectionError,
      });
    }
    return URL.createObjectURL(blob);
  }
}

class MockMrzDetectionService implements MrzDetectionService {
  async detectMrzRegion(image: PreprocessedImage): Promise<MrzRegion> {
    logger.debug("MockMrzDetectionService: returning simulated MRZ region");

    await this.simulateProcessing();

    const isTd1 = image.height > 700;
    const lineCount = isTd1 ? 3 : 2;
    const bandHeight = isTd1 ? Math.round(image.height * 0.18) : Math.round(image.height * 0.08);
    const y = image.height - bandHeight - MOCK_MRZ_VERTICAL_OFFSET;

    const formatInfo = detectMrzFormat(lineCount, bandHeight, image.height);

    return createMrzRegion(image.imagePath, MOCK_MRZ_FIXED_WIDTH, bandHeight, y, formatInfo);
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, MOCK_MRZ_DELAY_MS));
  }
}
