import { isTauri } from "../lib/isTauri";
import { invokeIpc } from "../infra/ipc";
import { logger } from "../lib/logger";
import type { CroppedImage } from "./document_crop_service";

/**
 * Preprocessing profile matching the Python OCR worker's adaptive preprocessing paths.
 *
 * - standard: CLAHE + denoise + deskew
 * - worn_creased: CLAHE + bilateral filter + morph close + adaptive threshold
 * - low_contrast: LAB CLAHE + gamma + unsharp mask + contrast stretch
 * - glare: glare mask + inpaint + standard pipeline
 * - rtl: same as standard but skip deskew for slight rotations
 */
export type PreprocessingProfile = "standard" | "worn_creased" | "low_contrast" | "glare" | "rtl";

export type PreprocessingOptions = {
  profile?: PreprocessingProfile;
  applyClahe?: boolean;
  denoise?: boolean;
  deskew?: boolean;
  upscale?: boolean;
  targetHeight?: number;
};

export type PreprocessingTransform = {
  /** Whether CLAHE contrast enhancement was applied */
  claheApplied: boolean;
  /** Whether denoising was applied */
  denoised: boolean;
  /** Whether deskew was applied */
  deskewApplied: boolean;
  /** Whether upscaling was applied */
  upscaled: boolean;
  /** Whether the image was rotated */
  rotated: boolean;
  /** Whether glare inpainting was applied */
  glareInpainted: boolean;
  /** Whether adaptive thresholding was applied (worn_creased profile) */
  adaptiveThreshold: boolean;
  /** Whether gamma correction was applied (low_contrast profile) */
  gammaCorrected: boolean;
};

export type PreprocessedImage = {
  imagePath: string;
  width: number;
  height: number;
  /** Final deskew angle applied (degrees). Positive = counter-clockwise. */
  deskewAngle: number;
  /** Final rotation angle applied (degrees). Positive = counter-clockwise. */
  rotationAngle: number;
  /** Which preprocessing profile was selected */
  profileUsed: PreprocessingProfile;
  /** Bitmask of which transforms were actually applied */
  transforms: PreprocessingTransform;
};

export type ImagePreprocessingError = "PREPROCESSING_FAILED" | "INVALID_IMAGE" | "OPTIONS_VALIDATION_FAILED";

export interface ImagePreprocessingService {
  preprocessImage(image: CroppedImage, options?: PreprocessingOptions): Promise<PreprocessedImage>;
}

const DEFAULT_PREPROCESSING_OPTIONS: PreprocessingOptions = {
  profile: "standard",
  applyClahe: true,
  denoise: true,
  deskew: true,
  upscale: false,
  targetHeight: 1200,
};

export function createImagePreprocessingService(): ImagePreprocessingService {
  if (isTauri()) {
    return new TauriImagePreprocessingService();
  }
  logger.debug("ImagePreprocessingService: not in Tauri context, using mock implementation");
  return new MockImagePreprocessingService();
}

function resolveOptions(
  options?: PreprocessingOptions,
): Required<PreprocessingOptions> & { profile: PreprocessingProfile } {
  return { ...DEFAULT_PREPROCESSING_OPTIONS, ...options } as Required<PreprocessingOptions> & {
    profile: PreprocessingProfile;
  };
}

class TauriImagePreprocessingService implements ImagePreprocessingService {
  async preprocessImage(image: CroppedImage, options?: PreprocessingOptions): Promise<PreprocessedImage> {
    const resolved = resolveOptions(options);
    logger.debug("ImagePreprocessingService: preprocessing image", {
      imagePath: image.imagePath,
      profile: resolved.profile,
    });

    try {
      const raw = await invokeIpc<{
        preprocessedPath: string;
        width: number;
        height: number;
        deskewAngle: number;
        rotationAngle: number;
        profileUsed: string;
        transforms: {
          claheApplied: boolean;
          denoised: boolean;
          deskewApplied: boolean;
          upscaled: boolean;
          rotated: boolean;
          glareInpainted: boolean;
          adaptiveThreshold: boolean;
          gammaCorrected: boolean;
        };
      }>("preprocess_image", {
        imagePath: image.imagePath,
        options: {
          profile: resolved.profile,
          applyClahe: resolved.applyClahe,
          denoise: resolved.denoise,
          deskew: resolved.deskew,
          upscale: resolved.upscale,
          targetHeight: resolved.targetHeight,
        },
      });

      return {
        imagePath: raw.preprocessedPath,
        width: raw.width,
        height: raw.height,
        deskewAngle: raw.deskewAngle,
        rotationAngle: raw.rotationAngle,
        profileUsed: raw.profileUsed as PreprocessingProfile,
        transforms: raw.transforms,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("invalid") ||
        message.includes("INVALID_IMAGE") ||
        message.includes("corrupt") ||
        message.includes("decode")
      ) {
        logger.warn("ImagePreprocessingService: invalid image", {
          imagePath: image.imagePath,
        });
        throw Object.assign(new Error("INVALID_IMAGE"), {
          type: "INVALID_IMAGE" as ImagePreprocessingError,
        });
      }
      logger.error("ImagePreprocessingService: preprocessing failed", error);
      throw Object.assign(new Error("PREPROCESSING_FAILED"), {
        type: "PREPROCESSING_FAILED" as ImagePreprocessingError,
      });
    }
  }
}

class MockImagePreprocessingService implements ImagePreprocessingService {
  async preprocessImage(image: CroppedImage, options?: PreprocessingOptions): Promise<PreprocessedImage> {
    logger.debug("ImagePreprocessingService (mock): returning simulated preprocessed result", {
      profile: options?.profile ?? "standard",
    });

    const resolved = resolveOptions(options);
    await this.simulateProcessing(resolved.profile);

    const transforms = this.buildTransforms(resolved.profile);
    const deskewAngle = -image.rotationAngle || 0;

    return {
      imagePath: image.imagePath,
      width: image.width,
      height: image.height,
      deskewAngle,
      rotationAngle: 0,
      profileUsed: resolved.profile,
      transforms,
    };
  }

  private buildTransforms(profile: PreprocessingProfile): PreprocessingTransform {
    const base: PreprocessingTransform = {
      claheApplied: true,
      denoised: true,
      deskewApplied: true,
      upscaled: false,
      rotated: false,
      glareInpainted: false,
      adaptiveThreshold: false,
      gammaCorrected: false,
    };

    switch (profile) {
      case "worn_creased":
        return {
          ...base,
          deskewApplied: false,
          adaptiveThreshold: true,
          denoised: true,
          claheApplied: true,
        };
      case "low_contrast":
        return {
          ...base,
          gammaCorrected: true,
          claheApplied: true,
          denoised: true,
        };
      case "glare":
        return {
          ...base,
          glareInpainted: true,
          claheApplied: true,
          denoised: true,
        };
      case "rtl":
        return {
          ...base,
          deskewApplied: false,
        };
      default:
        return base;
    }
  }

  private async simulateProcessing(profile: PreprocessingProfile): Promise<void> {
    const delays: Record<PreprocessingProfile, number> = {
      standard: 200,
      worn_creased: 350,
      low_contrast: 300,
      glare: 400,
      rtl: 200,
    };
    await new Promise((resolve) => setTimeout(resolve, delays[profile] ?? 200));
  }
}
