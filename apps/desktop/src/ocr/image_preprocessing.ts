import {
  imageDataToGrayscale,
  sobelEdgeDetection,
  clamp,
  makeImageData,
  createCanvas,
  extractImageData,
} from "./image_utils";
import { detectDocument, cropImage } from "./document_detection";
import { analyzeQuality, getRetakeWarning } from "./image_quality";
import type { QualityMetrics, RetakeWarning } from "./image_quality";
import type { Rectangle } from "./document_detection";
export type { QualityMetrics, RetakeWarning } from "./image_quality";
export type { Point, Rectangle, Corners } from "./document_detection";
export { detectDocument, cropImage, correctPerspective } from "./document_detection";
export { detectBlur, detectGlare, analyzeQuality, getRetakeWarning } from "./image_quality";

export interface PreprocessOptions {
  detectDocument?: boolean;
  correctPerspective?: boolean;
  correctRotation?: boolean;
  improveContrast?: boolean;
  denoise?: boolean;
  sharpen?: boolean;
  targetWidth?: number;
  targetHeight?: number;
}

export interface PreprocessResult {
  imageData: ImageData;
  width: number;
  height: number;
  documentBounds: Rectangle | null;
  rotationAngle: number;
  qualityMetrics: QualityMetrics;
  retakeWarning: RetakeWarning | null;
  transformsApplied: string[];
}

export function improveContrast(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  const gray = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    gray[i] = Math.round(0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!);
  }

  const histogram = new Uint32Array(256);
  for (let i = 0; i < totalPixels; i++) {
    const g = gray[i]!;
    histogram[g]!++;
  }

  let minVal = 0;
  let maxVal = 255;
  const minCut = Math.round(totalPixels * 0.005);
  const maxCut = Math.round(totalPixels * 0.005);
  let cum = 0;
  for (let i = 0; i < 256; i++) {
    cum += histogram[i]!;
    if (cum > minCut) {
      minVal = i;
      break;
    }
  }
  cum = 0;
  for (let i = 255; i >= 0; i--) {
    cum += histogram[i]!;
    if (cum > maxCut) {
      maxVal = i;
      break;
    }
  }

  if (maxVal <= minVal) return imageData;

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = ((data[idx]! - minVal) / (maxVal - minVal)) * 255;
    const g = ((data[idx + 1]! - minVal) / (maxVal - minVal)) * 255;
    const b = ((data[idx + 2]! - minVal) / (maxVal - minVal)) * 255;
    output[idx] = clamp(Math.round(r), 0, 255);
    output[idx + 1] = clamp(Math.round(g), 0, 255);
    output[idx + 2] = clamp(Math.round(b), 0, 255);
    output[idx + 3] = data[idx + 3]!;
  }

  return makeImageData(output, width, height);
}

export function denoise(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data);
  const radius = 1;
  const kernelSize = (radius * 2 + 1) * (radius * 2 + 1);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const rVals: number[] = [];
      const gVals: number[] = [];
      const bVals: number[] = [];

      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          rVals.push(data[idx]!);
          gVals.push(data[idx + 1]!);
          bVals.push(data[idx + 2]!);
        }
      }

      rVals.sort((a, b) => a - b);
      gVals.sort((a, b) => a - b);
      bVals.sort((a, b) => a - b);

      const mid = Math.floor(kernelSize / 2);
      const outIdx = (y * width + x) * 4;
      output[outIdx] = rVals[mid]!;
      output[outIdx + 1] = gVals[mid]!;
      output[outIdx + 2] = bVals[mid]!;
    }
  }

  return makeImageData(output, width, height);
}

export function sharpen(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const output = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)]!;
          r += data[idx]! * k;
          g += data[idx + 1]! * k;
          b += data[idx + 2]! * k;
        }
      }

      const outIdx = (y * width + x) * 4;
      output[outIdx] = clamp(Math.round(r), 0, 255);
      output[outIdx + 1] = clamp(Math.round(g), 0, 255);
      output[outIdx + 2] = clamp(Math.round(b), 0, 255);
      output[outIdx + 3] = data[outIdx + 3]!;
    }
  }

  return makeImageData(output, width, height);
}

export function correctRotation(imageData: ImageData): { imageData: ImageData; angle: number } {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdgeDetection(gray, width, height);

  const strongEdgeThreshold = 150;
  const points: { x: number; y: number; magnitude: number; angle: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const mag = edges[y * width + x]!;
      if (mag > strongEdgeThreshold) {
        const gx = gray[(y + 0) * width + Math.min(x + 1, width - 1)]! - gray[(y + 0) * width + Math.max(x - 1, 0)]!;
        const gy = gray[Math.min(y + 1, height - 1) * width + x]! - gray[Math.max(y - 1, 0) * width + x]!;
        const angle = Math.atan2(gy, gx);
        points.push({ x, y, magnitude: mag, angle });
      }
    }
  }

  if (points.length < 10) return { imageData, angle: 0 };

  const angleBuckets = new Map<number, number>();
  for (const p of points) {
    const deg = ((p.angle * 180) / Math.PI + 180) % 180;
    const bucket = Math.round(deg / 5) * 5;
    angleBuckets.set(bucket, (angleBuckets.get(bucket) ?? 0) + p.magnitude);
  }

  let bestAngle = 0;
  let bestScore = 0;
  for (const [angle, score] of angleBuckets) {
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  const rotationAngle = bestAngle > 90 ? bestAngle - 180 : bestAngle;
  const absAngle = Math.abs(rotationAngle);
  if (absAngle < 1) return { imageData, angle: 0 };

  const rad = (rotationAngle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const newWidth = Math.round(width * cos + height * sin);
  const newHeight = Math.round(width * sin + height * cos);

  const { canvas, ctx } = createCanvas(width, height);
  ctx.putImageData(imageData, 0, 0);

  const { ctx: rotCtx } = createCanvas(newWidth, newHeight);
  rotCtx.translate(newWidth / 2, newHeight / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(canvas, -width / 2, -height / 2);

  return { imageData: rotCtx.getImageData(0, 0, newWidth, newHeight), angle: rotationAngle };
}

export async function preprocessImage(
  source: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
  options: PreprocessOptions = {},
): Promise<PreprocessResult> {
  const opts: Required<PreprocessOptions> = {
    detectDocument: true,
    correctPerspective: true,
    correctRotation: true,
    improveContrast: true,
    denoise: true,
    sharpen: true,
    targetWidth: 0,
    targetHeight: 0,
    ...options,
  };

  let imageData = await extractImageData(source);
  const transformsApplied: string[] = [];

  const documentBounds = opts.detectDocument ? detectDocument(imageData) : null;

  if (documentBounds && opts.detectDocument) {
    imageData = cropImage(imageData, documentBounds);
    transformsApplied.push("crop");
  }

  if (opts.denoise) {
    imageData = denoise(imageData);
    transformsApplied.push("denoise");
  }

  if (opts.improveContrast) {
    imageData = improveContrast(imageData);
    transformsApplied.push("contrast_enhance");
  }

  if (opts.sharpen) {
    imageData = sharpen(imageData);
    transformsApplied.push("sharpen");
  }

  let rotationAngle = 0;
  if (opts.correctRotation) {
    const rotated = correctRotation(imageData);
    if (Math.abs(rotated.angle) > 0.5) {
      imageData = rotated.imageData;
      rotationAngle = rotated.angle;
      transformsApplied.push("rotation_correction");
    }
  }

  const qualityMetrics = analyzeQuality(imageData);
  const retakeWarning = getRetakeWarning(qualityMetrics);

  return {
    imageData,
    width: imageData.width,
    height: imageData.height,
    documentBounds,
    rotationAngle,
    qualityMetrics,
    retakeWarning,
    transformsApplied,
  };
}
