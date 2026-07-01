import { isTauri, requireTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";
import type { ImageInput } from "./image_quality_service";
import {
  MRZ_BOTTOM_PORTION_START,
  MRZ_MIN_HEIGHT_RATIO,
  MRZ_MAX_HEIGHT_RATIO,
  TEXT_DENSITY_THRESHOLD,
  PROJECTION_SMOOTH_WINDOW,
  DARK_LUMINANCE_THRESHOLD,
  JPEG_SAVE_QUALITY,
  MOCK_MRZ_DELAY_MS,
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

export type MrzPreprocessingVariant = {
  name: string;
  imagePath: string;
  width: number;
  height: number;
  preprocessingSteps: string[];
};

export type MrzCropResult = {
  croppedImagePath: string;
  variants: MrzPreprocessingVariant[];
  boundingBox: BoundingBox | null;
  detected: boolean;
  confidence: number;
  detectedFormat: "TD1" | "TD2" | "TD3" | "UNKNOWN";
  width: number;
  height: number;
};

export type MrzCropperError = "MRZ_NOT_DETECTED" | "CROP_FAILED" | "IMAGE_LOAD_FAILED";

export interface MrzCropperService {
  cropMrzZone(input: ImageInput): Promise<MrzCropResult>;
}

export type TextBand = {
  startY: number;
  endY: number;
  peakDensity: number;
};

export type MrzFormatInfo = {
  format: MrzCropResult["detectedFormat"];
  confidence: number;
  lineCount: number;
};

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
    if (Math.abs(densityDiff) > 0.05) return densityDiff;
    return b.startY - a.startY;
  });

  return candidates[0] ?? null;
}

export function estimateLineCountMrz(
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

export function createMrzCropperService(): MrzCropperService {
  if (isTauri()) {
    logger.debug("MrzCropperService: using Tauri implementation");
    return new TauriMrzCropperService();
  }

  try {
    if (typeof document !== "undefined" && typeof document.createElement !== "undefined") {
      logger.debug("MrzCropperService: using heuristic implementation");
      return new HeuristicMrzCropperService();
    }
  } catch {
    // Not in a browser-like environment
  }

  logger.debug("MrzCropperService: using mock implementation");
  return new MockMrzCropperService();
}

class TauriMrzCropperService implements MrzCropperService {
  async cropMrzZone(input: ImageInput): Promise<MrzCropResult> {
    await requireTauri();

    logger.debug("TauriMrzCropperService: cropping MRZ zone", {
      imagePath: input.imagePath,
    });

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");

      const raw = await invoke<{
        croppedPath: string;
        variants: Array<{
          name: string;
          path: string;
          width: number;
          height: number;
          steps: string[];
        }>;
        bbox: { x: number; y: number; width: number; height: number } | null;
        detected: boolean;
        confidence: number;
        format: string;
        width: number;
        height: number;
      }>("crop_mrz_zone", { imagePath: input.imagePath });

      return {
        croppedImagePath: raw.croppedPath,
        variants: raw.variants.map((v) => ({
          name: v.name,
          imagePath: v.path,
          width: v.width,
          height: v.height,
          preprocessingSteps: v.steps,
        })),
        boundingBox: raw.bbox,
        detected: raw.detected,
        confidence: raw.confidence,
        detectedFormat: raw.format as MrzCropResult["detectedFormat"],
        width: raw.width,
        height: raw.height,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("MRZ_NOT_DETECTED")) {
        logger.warn("TauriMrzCropperService: MRZ not detected", {
          imagePath: input.imagePath,
        });
        throw Object.assign(new Error("MRZ_NOT_DETECTED"), {
          type: "MRZ_NOT_DETECTED" as MrzCropperError,
        });
      }
      logger.error("TauriMrzCropperService: cropping failed", error);
      throw Object.assign(new Error("CROP_FAILED"), {
        type: "CROP_FAILED" as MrzCropperError,
      });
    }
  }
}

class HeuristicMrzCropperService implements MrzCropperService {
  async cropMrzZone(input: ImageInput): Promise<MrzCropResult> {
    logger.debug("HeuristicMrzCropperService: cropping MRZ zone", {
      imagePath: input.imagePath,
    });

    try {
      const canvas = document.createElement("canvas");
      const img = await this.loadImage(input.imagePath);

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw Object.assign(new Error("CROP_FAILED"), {
          type: "CROP_FAILED" as MrzCropperError,
        });
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);

      const projection = computeHorizontalProjection(pixels, canvas.width, canvas.height);
      const smoothed = smoothProjection(projection, PROJECTION_SMOOTH_WINDOW);
      const bands = findTextBands(smoothed, TEXT_DENSITY_THRESHOLD);

      if (bands.length === 0) {
        logger.warn("HeuristicMrzCropperService: no text bands found");
        throw Object.assign(new Error("MRZ_NOT_DETECTED"), {
          type: "MRZ_NOT_DETECTED" as MrzCropperError,
        });
      }

      const mrzBand = selectMrzBand(bands, canvas.height, MRZ_MIN_HEIGHT_RATIO, MRZ_MAX_HEIGHT_RATIO);

      if (!mrzBand) {
        logger.warn("HeuristicMrzCropperService: no valid MRZ band", {
          bandCount: bands.length,
        });
        throw Object.assign(new Error("MRZ_NOT_DETECTED"), {
          type: "MRZ_NOT_DETECTED" as MrzCropperError,
        });
      }

      const lineCount = estimateLineCountMrz(projection, mrzBand.startY, mrzBand.endY, TEXT_DENSITY_THRESHOLD, 12);

      const bandHeight = mrzBand.endY - mrzBand.startY + 1;
      const formatInfo = detectMrzFormat(lineCount, bandHeight, canvas.height);
      const mrzWidth = canvas.width;

      const baseCrop = await this.cropRegion(canvas, 0, mrzBand.startY, mrzWidth, bandHeight);

      const variants = await this.generatePreprocessingVariants(baseCrop, mrzWidth, bandHeight);

      const bestVariantIndex = variants.findIndex((v) => v.name === "clahe_upscale_sharpen");

      const bestVariant = bestVariantIndex >= 0 ? variants[bestVariantIndex]! : variants[0]!;

      return {
        croppedImagePath: bestVariant.imagePath,
        variants,
        boundingBox: {
          x: 0,
          y: mrzBand.startY,
          width: mrzWidth,
          height: bandHeight,
        },
        detected: true,
        confidence: formatInfo.confidence,
        detectedFormat: formatInfo.format,
        width: mrzWidth,
        height: bandHeight,
      };
    } catch (error) {
      if (error instanceof Error && "type" in error) {
        throw error;
      }
      logger.error("HeuristicMrzCropperService: detection failed", error);
      throw Object.assign(new Error("CROP_FAILED"), {
        type: "CROP_FAILED" as MrzCropperError,
      });
    }
  }

  private async generatePreprocessingVariants(
    baseCanvas: HTMLCanvasElement,
    width: number,
    height: number,
  ): Promise<MrzPreprocessingVariant[]> {
    const variants: MrzPreprocessingVariant[] = [];

    const grayscale = this.toGrayscale(baseCanvas);
    variants.push(await this.saveVariant(grayscale, "grayscale", ["grayscale"]));

    const clahe = this.applyClahe(grayscale);
    variants.push(await this.saveVariant(clahe, "clahe", ["grayscale", "clahe"]));

    const upscale2 = this.resizeCanvas(grayscale, width * 2, height * 2);
    variants.push(await this.saveVariant(upscale2, "upscale_2x", ["grayscale", "upscale_2x"]));

    const upscale3 = this.resizeCanvas(grayscale, width * 3, height * 3);
    variants.push(await this.saveVariant(upscale3, "upscale_3x", ["grayscale", "upscale_3x"]));

    const claheUpscale = this.resizeCanvas(clahe, width * 2, height * 2);
    variants.push(await this.saveVariant(claheUpscale, "clahe_upscale_2x", ["grayscale", "clahe", "upscale_2x"]));

    const sharpened = this.sharpen(claheUpscale);
    variants.push(
      await this.saveVariant(sharpened, "clahe_upscale_sharpen", ["grayscale", "clahe", "upscale_2x", "sharpen"]),
    );

    const denoised = this.denoise(sharpened);
    variants.push(
      await this.saveVariant(denoised, "clahe_upscale_sharpen_denoise", [
        "grayscale",
        "clahe",
        "upscale_2x",
        "sharpen",
        "denoise",
      ]),
    );

    const adaptive = this.applyAdaptiveThreshold(claheUpscale);
    variants.push(
      await this.saveVariant(adaptive, "clahe_upscale_adaptive_threshold", [
        "grayscale",
        "clahe",
        "upscale_2x",
        "adaptive_threshold",
      ]),
    );

    return variants;
  }

  private toGrayscale(source: HTMLCanvasElement): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;

    const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
    const { data } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let i = 0; i < source.width * source.height; i++) {
      const idx = i * 4;
      const gray = Math.round(0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!);
      output[idx] = gray;
      output[idx + 1] = gray;
      output[idx + 2] = gray;
      output[idx + 3] = data[idx + 3]!;
    }

    const outputImageData = new ImageData(output, source.width, source.height);
    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
  }

  private applyClahe(source: HTMLCanvasElement, clipLimit: number = 2, tileSize: number = 8): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;

    const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);

    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    const clipLimitNorm = (clipLimit / (tileSize * tileSize)) * 256;

    const histograms: Uint32Array[] = [];

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const hist = new Uint32Array(256);
        for (let y = ty * tileSize; y < Math.min((ty + 1) * tileSize, height); y++) {
          for (let x = tx * tileSize; x < Math.min((tx + 1) * tileSize, width); x++) {
            const idx = (y * width + x) * 4;
            hist[data[idx]!]!++;
          }
        }
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i]! > clipLimitNorm) {
            excess += hist[i]! - clipLimitNorm;
            hist[i] = clipLimitNorm;
          }
        }
        const redistribute = Math.floor(excess / 256);
        for (let i = 0; i < 256; i++) {
          hist[i] = (hist[i] ?? 0) + redistribute;
        }
        histograms.push(hist);
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tx = Math.min(Math.floor(x / tileSize), tilesX - 1);
        const ty = Math.min(Math.floor(y / tileSize), tilesY - 1);

        const histIndex = ty * tilesX + tx;
        const hist = histograms[histIndex];
        if (!hist) continue;

        const idx = (y * width + x) * 4;
        const pixel = data[idx]!;

        let sum = 0;
        for (let i = 0; i <= pixel; i++) {
          sum += hist[i] ?? 0;
        }
        const totalPixels = tileSize * tileSize;
        const equalized = Math.round((sum / totalPixels) * 255);
        output[idx] = equalized;
        output[idx + 1] = equalized;
        output[idx + 2] = equalized;
      }
    }

    const outputImageData = new ImageData(output, width, height);
    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
  }

  private sharpen(source: HTMLCanvasElement): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;

    const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);

    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            const k = kernel[(ky + 1) * 3 + (kx + 1)]!;
            r += data[idx]! * k;
          }
        }
        const outIdx = (y * width + x) * 4;
        const val = Math.max(0, Math.min(255, Math.round(r)));
        output[outIdx] = val;
        output[outIdx + 1] = val;
        output[outIdx + 2] = val;
        output[outIdx + 3] = data[outIdx + 3]!;
      }
    }

    const outputImageData = new ImageData(output, width, height);
    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
  }

  private denoise(source: HTMLCanvasElement): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;

    const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const radius = 1;
    const kernelSize = (radius * 2 + 1) * (radius * 2 + 1);

    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const vals: number[] = [];
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            vals.push(data[idx]!);
          }
        }
        vals.sort((a, b) => a - b);
        const mid = Math.floor(kernelSize / 2);
        const outIdx = (y * width + x) * 4;
        output[outIdx] = vals[mid]!;
        output[outIdx + 1] = vals[mid]!;
        output[outIdx + 2] = vals[mid]!;
      }
    }

    const outputImageData = new ImageData(output, width, height);
    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
  }

  private applyAdaptiveThreshold(source: HTMLCanvasElement, blockSize: number = 31, c: number = 10): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(source.width, source.height);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;

    const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      gray[i] = data[i * 4]!;
    }

    const integral = new Uint32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += gray[y * width + x]!;
        integral[(y + 1) * (width + 1) + (x + 1)] = rowSum + integral[y * (width + 1) + (x + 1)]!;
      }
    }

    const output = new Uint8ClampedArray(data.length);
    const halfBlock = Math.floor(blockSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(x - halfBlock, 0);
        const y1 = Math.max(y - halfBlock, 0);
        const x2 = Math.min(x + halfBlock, width - 1);
        const y2 = Math.min(y + halfBlock, height - 1);

        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        const sum =
          integral[(y2 + 1) * (width + 1) + (x2 + 1)]! -
          integral[y1 * (width + 1) + (x2 + 1)]! -
          integral[(y2 + 1) * (width + 1) + x1]! +
          integral[y1 * (width + 1) + x1]!;

        const mean = sum / area;
        const idx = (y * width + x) * 4;
        const pixel = gray[y * width + x]!;
        const binary = pixel > mean - c ? 255 : 0;
        output[idx] = binary;
        output[idx + 1] = binary;
        output[idx + 2] = binary;
        output[idx + 3] = data[idx + 3]!;
      }
    }

    const outputImageData = new ImageData(output, width, height);
    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
  }

  private resizeCanvas(source: HTMLCanvasElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
    const { canvas, ctx } = this.createCanvas(targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    return canvas;
  }

  private async cropRegion(
    source: HTMLCanvasElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Promise<HTMLCanvasElement> {
    const { canvas, ctx } = this.createCanvas(w, h);
    const srcCtx = source.getContext("2d");
    if (!srcCtx) return canvas;
    const imageData = srcCtx.getImageData(x, y, w, h);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  private async saveVariant(
    canvas: HTMLCanvasElement,
    name: string,
    steps: string[],
  ): Promise<MrzPreprocessingVariant> {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_SAVE_QUALITY),
    );

    const imagePath = blob ? URL.createObjectURL(blob) : "";

    return {
      name,
      imagePath,
      width: canvas.width,
      height: canvas.height,
      preprocessingSteps: steps,
    };
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          Object.assign(new Error("IMAGE_LOAD_FAILED"), {
            type: "IMAGE_LOAD_FAILED" as MrzCropperError,
          }),
        );
      img.src = src;
    });
  }

  private createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas 2D context");
    return { canvas, ctx };
  }
}

class MockMrzCropperService implements MrzCropperService {
  async cropMrzZone(input: ImageInput): Promise<MrzCropResult> {
    logger.debug("MockMrzCropperService: returning simulated MRZ crop result");

    await this.simulateProcessing();

    const croppedWidth = 400;
    const croppedHeight = 80;
    const mockPath = input.imagePath;

    const variants: MrzPreprocessingVariant[] = [
      {
        name: "grayscale",
        imagePath: mockPath,
        width: croppedWidth,
        height: croppedHeight,
        preprocessingSteps: ["grayscale"],
      },
      {
        name: "clahe_upscale_sharpen",
        imagePath: mockPath,
        width: croppedWidth * 2,
        height: croppedHeight * 2,
        preprocessingSteps: ["grayscale", "clahe", "upscale_2x", "sharpen"],
      },
      {
        name: "clahe_upscale_adaptive_threshold",
        imagePath: mockPath,
        width: croppedWidth * 2,
        height: croppedHeight * 2,
        preprocessingSteps: ["grayscale", "clahe", "upscale_2x", "adaptive_threshold"],
      },
    ];

    return {
      croppedImagePath: variants[1]!.imagePath,
      variants,
      boundingBox: {
        x: 0,
        y: 520,
        width: croppedWidth,
        height: croppedHeight,
      },
      detected: true,
      confidence: 0.8,
      detectedFormat: "TD3",
      width: croppedWidth,
      height: croppedHeight,
    };
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, MOCK_MRZ_DELAY_MS));
  }
}
