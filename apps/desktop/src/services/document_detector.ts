import { isTauri } from "../lib/isTauri";
import { invokeIpc } from "../infra/ipc";
import { logger } from "../lib/logger";
import type { ImageInput } from "./image_quality_service";
import { JPEG_SAVE_QUALITY, MOCK_CROP_DELAY_MS } from "../config/constants";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CornerPoint = {
  x: number;
  y: number;
};

export type DocumentCorrectionResult = {
  correctedImagePath: string;
  originalImagePath: string;
  detected: boolean;
  bounds: BoundingBox | null;
  perspectiveCorrected: boolean;
  deskewAngle: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  transformsApplied: string[];
};

export type DocumentDetectorError =
  | "DOCUMENT_NOT_DETECTED"
  | "PERSPECTIVE_CORRECTION_FAILED"
  | "IMAGE_LOAD_FAILED"
  | "PROCESSING_FAILED";

export interface DocumentDetectorService {
  detectAndCorrect(input: ImageInput): Promise<DocumentCorrectionResult>;
}

export function createDocumentDetectorService(): DocumentDetectorService {
  if (isTauri()) {
    logger.debug("DocumentDetectorService: using Tauri implementation");
    return new TauriDocumentDetectorService();
  }
  try {
    if (typeof document !== "undefined" && typeof document.createElement !== "undefined") {
      logger.debug("DocumentDetectorService: using heuristic implementation");
      return new HeuristicDocumentDetectorService();
    }
  } catch {
    // Not in a browser-like environment
  }
  logger.debug("DocumentDetectorService: not in Tauri or browser context, using mock implementation");
  return new MockDocumentDetectorService();
}

class TauriDocumentDetectorService implements DocumentDetectorService {
  async detectAndCorrect(input: ImageInput): Promise<DocumentCorrectionResult> {
    logger.debug("DocumentDetectorService (Tauri): detecting and correcting document", {
      imagePath: input.imagePath,
    });

    try {
      const raw = await invokeIpc<{
        correctedPath: string;
        originalPath: string;
        detected: boolean;
        bounds: { x: number; y: number; width: number; height: number } | null;
        perspectiveCorrected: boolean;
        deskewAngle: number;
        width: number;
        height: number;
        originalWidth: number;
        originalHeight: number;
        transformsApplied: string[];
      }>("detect_and_correct_document", { imagePath: input.imagePath });

      return {
        correctedImagePath: raw.correctedPath,
        originalImagePath: raw.originalPath,
        detected: raw.detected,
        bounds: raw.bounds,
        perspectiveCorrected: raw.perspectiveCorrected,
        deskewAngle: raw.deskewAngle,
        width: raw.width,
        height: raw.height,
        originalWidth: raw.originalWidth,
        originalHeight: raw.originalHeight,
        transformsApplied: raw.transformsApplied,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not detected") || message.includes("DOCUMENT_NOT_DETECTED")) {
        logger.warn("DocumentDetectorService (Tauri): document not detected", {
          imagePath: input.imagePath,
        });
        throw Object.assign(new Error("DOCUMENT_NOT_DETECTED"), {
          type: "DOCUMENT_NOT_DETECTED" as DocumentDetectorError,
        });
      }
      logger.error("DocumentDetectorService (Tauri): processing failed", error);
      throw Object.assign(new Error("PROCESSING_FAILED"), {
        type: "PROCESSING_FAILED" as DocumentDetectorError,
      });
    }
  }
}

class HeuristicDocumentDetectorService implements DocumentDetectorService {
  async detectAndCorrect(input: ImageInput): Promise<DocumentCorrectionResult> {
    logger.debug("DocumentDetectorService (heuristic): detecting and correcting document", {
      imagePath: input.imagePath,
    });

    try {
      const img = await this.loadImage(input.imagePath);
      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      const { ctx: srcCtx } = this.createCanvas(originalWidth, originalHeight);
      srcCtx.drawImage(img, 0, 0);
      const imageData = srcCtx.getImageData(0, 0, originalWidth, originalHeight);

      const { detectDocument, cropImage, correctPerspective } = await this.loadDocumentDetection();
      const { correctRotation } = await this.loadImagePreprocessing();

      const documentBounds = detectDocument(imageData);
      const transformsApplied: string[] = [];

      let processed = imageData;

      if (documentBounds) {
        processed = cropImage(processed, documentBounds);
        transformsApplied.push("crop");

        const corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint] = [
          { x: documentBounds.x, y: documentBounds.y },
          { x: documentBounds.x + documentBounds.width, y: documentBounds.y },
          { x: documentBounds.x + documentBounds.width, y: documentBounds.y + documentBounds.height },
          { x: documentBounds.x, y: documentBounds.y + documentBounds.height },
        ];

        const perspectiveCorrected = correctPerspective(processed, corners);
        if (perspectiveCorrected) {
          processed = perspectiveCorrected;
          transformsApplied.push("perspective_correction");
        }
      }

      const rotated = correctRotation(processed);
      let deskewAngle = 0;
      if (Math.abs(rotated.angle) > 0.5) {
        processed = rotated.imageData;
        deskewAngle = rotated.angle;
        transformsApplied.push("deskew");
      }

      const { canvas: resultCanvas, ctx: resultCtx } = this.createCanvas(processed.width, processed.height);
      resultCtx.putImageData(processed, 0, 0);

      const correctedBlob = await new Promise<Blob | null>((resolve) =>
        resultCanvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_SAVE_QUALITY),
      );
      if (!correctedBlob) {
        throw Object.assign(new Error("PROCESSING_FAILED"), {
          type: "PROCESSING_FAILED" as DocumentDetectorError,
        });
      }
      const correctedImagePath = URL.createObjectURL(correctedBlob);

      return {
        correctedImagePath,
        originalImagePath: input.imagePath,
        detected: documentBounds !== null,
        bounds: documentBounds
          ? { x: documentBounds.x, y: documentBounds.y, width: documentBounds.width, height: documentBounds.height }
          : null,
        perspectiveCorrected: transformsApplied.includes("perspective_correction"),
        deskewAngle,
        width: processed.width,
        height: processed.height,
        originalWidth,
        originalHeight,
        transformsApplied,
      };
    } catch (error) {
      if (error instanceof Error && "type" in error) {
        throw error;
      }
      logger.error("DocumentDetectorService (heuristic): processing failed", error);
      throw Object.assign(new Error("PROCESSING_FAILED"), {
        type: "PROCESSING_FAILED" as DocumentDetectorError,
      });
    }
  }

  private async loadDocumentDetection(): Promise<{
    detectDocument: (imageData: ImageData) => { x: number; y: number; width: number; height: number } | null;
    cropImage: (imageData: ImageData, bounds: { x: number; y: number; width: number; height: number }) => ImageData;
    correctPerspective: (
      imageData: ImageData,
      corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
    ) => ImageData;
  }> {
    const mod = await import("../ocr/document_detection");
    return {
      detectDocument: mod.detectDocument,
      cropImage: mod.cropImage,
      correctPerspective: mod.correctPerspective as unknown as (
        imageData: ImageData,
        corners: [CornerPoint, CornerPoint, CornerPoint, CornerPoint],
      ) => ImageData,
    };
  }

  private async loadImagePreprocessing(): Promise<{
    correctRotation: (imageData: ImageData) => { imageData: ImageData; angle: number };
  }> {
    const mod = await import("../ocr/image_preprocessing");
    return {
      correctRotation: mod.correctRotation,
    };
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          Object.assign(new Error("IMAGE_LOAD_FAILED"), {
            type: "IMAGE_LOAD_FAILED" as DocumentDetectorError,
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

class MockDocumentDetectorService implements DocumentDetectorService {
  async detectAndCorrect(input: ImageInput): Promise<DocumentCorrectionResult> {
    logger.debug("DocumentDetectorService (mock): returning simulated document correction result");

    await this.simulateProcessing();

    return {
      correctedImagePath: input.imagePath,
      originalImagePath: input.imagePath,
      detected: true,
      bounds: { x: 50, y: 50, width: 700, height: 500 },
      perspectiveCorrected: false,
      deskewAngle: 0,
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      transformsApplied: ["crop"],
    };
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, MOCK_CROP_DELAY_MS));
  }
}
