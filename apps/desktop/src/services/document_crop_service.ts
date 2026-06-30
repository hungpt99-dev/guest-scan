import { isTauri, requireTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";
import type { ImageInput } from "./image_quality_service";

export type CroppedImage = {
  imagePath: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  rotationAngle: number;
};

export type CropDocumentError = "DOCUMENT_NOT_DETECTED" | "CROP_FAILED";

export interface DocumentCropService {
  cropDocument(input: ImageInput): Promise<CroppedImage>;
}

export function createDocumentCropService(): DocumentCropService {
  if (isTauri()) {
    return new TauriDocumentCropService();
  }
  logger.debug("DocumentCropService: not in Tauri context, using mock implementation");
  return new MockDocumentCropService();
}

class TauriDocumentCropService implements DocumentCropService {
  async cropDocument(input: ImageInput): Promise<CroppedImage> {
    await requireTauri();

    logger.debug("DocumentCropService: cropping document", { imagePath: input.imagePath });

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");

      const raw = await invoke<{
        croppedPath: string;
        width: number;
        height: number;
        originalWidth: number;
        originalHeight: number;
        rotationAngle: number;
      }>("crop_document", { imagePath: input.imagePath });

      return {
        imagePath: raw.croppedPath,
        width: raw.width,
        height: raw.height,
        originalWidth: raw.originalWidth,
        originalHeight: raw.originalHeight,
        rotationAngle: raw.rotationAngle,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not detected") || message.includes("DOCUMENT_NOT_DETECTED")) {
        logger.warn("DocumentCropService: document not detected", { imagePath: input.imagePath });
        throw Object.assign(new Error("DOCUMENT_NOT_DETECTED"), { type: "DOCUMENT_NOT_DETECTED" as CropDocumentError });
      }
      logger.error("DocumentCropService: crop failed", error);
      throw Object.assign(new Error("CROP_FAILED"), { type: "CROP_FAILED" as CropDocumentError });
    }
  }
}

class MockDocumentCropService implements DocumentCropService {
  async cropDocument(input: ImageInput): Promise<CroppedImage> {
    logger.debug("DocumentCropService (mock): returning simulated crop result");

    await this.simulateProcessing();

    return {
      imagePath: input.imagePath,
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    };
  }

  private async simulateProcessing(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
