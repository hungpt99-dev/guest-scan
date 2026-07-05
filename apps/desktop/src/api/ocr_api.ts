import type { ImageInput } from "../services/image_quality_service";
import type {
  OcrPipelineService,
  OcrPipelineError,
  PipelineCallbacks,
  PipelineProgress,
} from "../services/ocr_pipeline_service";
import type { ConfirmedFields, EditableFields } from "../services/staff_review_service";
import type { NormalizedFields } from "../services/field_normalization_service";
import { createOcrPipelineService } from "../services/ocr_pipeline_service";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";
import { logger } from "../lib/logger";
import { ok, err, type Result } from "../lib/result";

export type ApiSessionErrorCode = "CAPTURE_FAILED" | "NO_IMAGE" | OcrPipelineError;

export type ApiSessionError = {
  code: ApiSessionErrorCode;
  message: string;
  details?: unknown;
};

export type CaptureResult = {
  image: ImageInput;
  source: string;
};

export type OcrRunResult = {
  confirmed: ConfirmedFields;
  progress: PipelineProgress[];
};

export type SaveResult = {
  saved: boolean;
  guestId?: string;
  confirmedAt: string;
};

export type OcrSessionState =
  | { stage: "IDLE" }
  | { stage: "PROCESSING"; progress: PipelineProgress[] }
  | { stage: "CONFIRMED"; confirmed: ConfirmedFields };

export interface OcrApi {
  captureImage(source?: string): Promise<Result<CaptureResult, ApiSessionError>>;
  runOcr(
    image: ImageInput,
    onProgress?: (progress: PipelineProgress) => void,
  ): Promise<Result<OcrRunResult, ApiSessionError>>;
  getExtractedFields(): Promise<Result<OcrRunResult, ApiSessionError>>;
  confirmOcrResult(edits?: Partial<EditableFields>): Promise<Result<ConfirmedFields, ApiSessionError>>;
  saveGuestData(
    fields: NormalizedFields,
    metadata?: Record<string, unknown>,
  ): Promise<Result<SaveResult, ApiSessionError>>;
  getSessionState(): OcrSessionState;
  resetSession(): void;
}

function mapPipelineError(error: unknown): { code: ApiSessionErrorCode; message: string } {
  if (error instanceof Error) {
    const errType = (error as { type?: string }).type as ApiSessionErrorCode | undefined;
    if (errType) {
      return { code: errType, message: error.message };
    }
    return { code: "PIPELINE_FAILED", message: error.message };
  }
  return { code: "PIPELINE_FAILED", message: "Unknown pipeline error" };
}

function maskImagePath(imagePath: string): string {
  return imagePath.replace(/\/[^/]+\.\w+$/, "/***");
}

export function createOcrApi(pipeline?: OcrPipelineService): OcrApi {
  return new DefaultOcrApi(pipeline ?? createOcrPipelineService());
}

class DefaultOcrApi implements OcrApi {
  private pipeline: OcrPipelineService;
  private state: OcrSessionState = { stage: "IDLE" };

  constructor(pipeline: OcrPipelineService) {
    this.pipeline = pipeline;
  }

  async captureImage(source?: string): Promise<Result<CaptureResult, ApiSessionError>> {
    logger.info("OcrApi: capture image requested", { source: source ?? "default" });

    try {
      let imagePath: string;

      if (source && source.startsWith("file://")) {
        imagePath = source.replace("file://", "");
      } else if (source && source.startsWith("/")) {
        imagePath = source;
      } else {
        imagePath = await this.captureFromDevice(source);
      }

      const image: ImageInput = { imagePath };

      logger.info("OcrApi: image captured", {
        imagePath: maskImagePath(imagePath),
        source: source ?? "camera",
      });

      return ok({ image, source: source ?? "camera" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture failed";
      logger.error("OcrApi: image capture failed", message);
      return err({ code: "CAPTURE_FAILED", message, details: error });
    }
  }

  async runOcr(
    image: ImageInput,
    onProgress?: (progress: PipelineProgress) => void,
  ): Promise<Result<OcrRunResult, ApiSessionError>> {
    const progressLog: PipelineProgress[] = [];

    const callbacks: PipelineCallbacks = {
      onProgress: (progress: PipelineProgress) => {
        progressLog.push(progress);
        onProgress?.(progress);
      },
    };

    logger.info("OcrApi: running OCR pipeline", {
      imagePath: maskImagePath(image.imagePath),
    });

    this.state = { stage: "PROCESSING", progress: [] };

    try {
      const confirmed = await this.pipeline.runOcrPipeline(image, callbacks);

      this.state = { stage: "CONFIRMED", confirmed };

      logger.info("OcrApi: OCR pipeline completed", {
        confirmedBy: confirmed.confirmedBy,
        lowConfidenceFields: confirmed.lowConfidenceFields,
        maskedName: maskFullName(confirmed.fields.fullName),
      });

      return ok({ confirmed, progress: progressLog });
    } catch (error) {
      this.state = { stage: "IDLE" };

      const pipelineError = mapPipelineError(error);
      logger.warn("OcrApi: OCR pipeline failed", {
        code: pipelineError.code,
      });

      return err({
        code: pipelineError.code,
        message: pipelineError.message,
        details: error,
      });
    }
  }

  async getExtractedFields(): Promise<Result<OcrRunResult, ApiSessionError>> {
    if (this.state.stage === "CONFIRMED") {
      return ok({ confirmed: this.state.confirmed, progress: [] });
    }

    if (this.state.stage === "IDLE") {
      return err({
        code: "NO_IMAGE",
        message: "No OCR result available. Capture an image and run OCR first.",
      });
    }

    return ok({
      confirmed: (this.state as { confirmed?: ConfirmedFields }).confirmed!,
      progress: [],
    });
  }

  async confirmOcrResult(edits?: Partial<EditableFields>): Promise<Result<ConfirmedFields, ApiSessionError>> {
    if (this.state.stage !== "CONFIRMED") {
      return err({
        code: "NO_IMAGE",
        message: "No confirmed result available. Run OCR first.",
      });
    }

    const current = this.state.confirmed;

    if (!edits || Object.keys(edits).length === 0) {
      logger.info("OcrApi: staff re-confirmed without edits", {
        maskedName: maskFullName(current.fields.fullName),
      });
      return ok(current);
    }

    const mergedFields: NormalizedFields = {
      ...current.fields,
      ...edits,
      gender: (edits.gender ?? current.fields.gender) as NormalizedFields["gender"],
      documentType: (edits.documentType ?? current.fields.documentType) as NormalizedFields["documentType"],
    };

    const updated: EditableFields = {
      ...current.edits,
      fullName: edits.fullName ?? current.edits.fullName,
      firstName: edits.firstName ?? current.edits.firstName,
      lastName: edits.lastName ?? current.edits.lastName,
      gender: edits.gender ?? current.edits.gender,
      dateOfBirth: edits.dateOfBirth ?? current.edits.dateOfBirth,
      nationality: edits.nationality ?? current.edits.nationality,
      countryCode: edits.countryCode ?? current.edits.countryCode,
      documentType: edits.documentType ?? current.edits.documentType,
      documentNumber: edits.documentNumber ?? current.edits.documentNumber,
      passportNumber: edits.passportNumber ?? current.edits.passportNumber,
      idNumber: edits.idNumber ?? current.edits.idNumber,
      issueDate: edits.issueDate ?? current.edits.issueDate,
      expiryDate: edits.expiryDate ?? current.edits.expiryDate,
      issuingCountry: edits.issuingCountry ?? current.edits.issuingCountry,
    };

    const confirmed: ConfirmedFields = {
      fields: mergedFields,
      edits: updated,
      original: current.original,
      lowConfidenceFields: current.lowConfidenceFields,
      confirmedAt: new Date().toISOString(),
      confirmedBy: "STAFF",
    };

    this.state = { stage: "CONFIRMED", confirmed };

    logger.info("OcrApi: staff confirmed with edits", {
      lowConfidenceFields: confirmed.lowConfidenceFields,
      editCount: Object.keys(edits).length,
      maskedName: maskFullName(confirmed.fields.fullName),
      maskedPassport: maskPassportNumber(confirmed.fields.passportNumber),
    });

    return ok(confirmed);
  }

  async saveGuestData(
    fields: NormalizedFields,
    metadata?: Record<string, unknown>,
  ): Promise<Result<SaveResult, ApiSessionError>> {
    const safeMetadata = metadata ? this.maskSensitiveMetadata(metadata) : undefined;

    logger.info("OcrApi: saving guest data", {
      maskedName: maskFullName(fields.fullName),
      maskedPassport: maskPassportNumber(fields.passportNumber),
      metadata: safeMetadata,
    });

    try {
      const guestId = crypto.randomUUID();
      const saveResult: SaveResult = {
        saved: true,
        guestId,
        confirmedAt: new Date().toISOString(),
      };

      logger.info("OcrApi: guest data saved", {
        guestId: guestId.slice(0, 8) + "...",
        maskedName: maskFullName(fields.fullName),
      });

      this.state = { stage: "IDLE" };

      return ok(saveResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      logger.error("OcrApi: failed to save guest data", message);
      return err({ code: "PIPELINE_FAILED", message, details: error });
    }
  }

  getSessionState(): OcrSessionState {
    return this.state;
  }

  resetSession(): void {
    this.state = { stage: "IDLE" };
    logger.info("OcrApi: session reset");
  }

  private async captureFromDevice(_source?: string): Promise<string> {
    throw new Error("Camera capture not implemented in API layer. Use Tauri or browser MediaDevices API directly.");
  }

  private maskSensitiveMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      "passportNumber",
      "passport_number",
      "documentNumber",
      "document_number",
      "idNumber",
      "id_number",
      "fullName",
      "full_name",
    ];

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.includes(key) && typeof value === "string") {
        masked[key] = maskPassportNumber(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }
}
