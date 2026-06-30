import type { ImageInput } from "./image_quality_service";
import type { CroppedImage } from "./document_crop_service";
import type { PreprocessedImage } from "./image_preprocessing_service";
import type { MrzRegion } from "./mrz_detection_service";
import type { MrzParseResult } from "./mrz_parser_service";
import type { MrzChecksumValidationResult } from "./mrz_checksum_validator";
import type { NormalizedFields, MrzParsedFields } from "./field_normalization_service";
import type { FieldConfidenceScores } from "./ocr_confidence_service";
import type { ConfirmedFields, PendingReview } from "./staff_review_service";
import type { OcrEngine, OcrInput, OcrTextResult } from "../ocr/ocr_engine";
import type { ImageQualityService } from "./image_quality_service";
import type { DocumentCropService } from "./document_crop_service";
import type { ImagePreprocessingService } from "./image_preprocessing_service";
import type { MrzDetectionService } from "./mrz_detection_service";
import type { MrzParserService } from "./mrz_parser_service";
import type { MrzChecksumValidator } from "./mrz_checksum_validator";
import type { FieldNormalizationService } from "./field_normalization_service";
import type { OcrConfidenceService } from "./ocr_confidence_service";
import type { StaffReviewService } from "./staff_review_service";
import { createImageQualityService } from "./image_quality_service";
import { createDocumentCropService } from "./document_crop_service";
import { createImagePreprocessingService } from "./image_preprocessing_service";
import { createMrzDetectionService } from "./mrz_detection_service";
import { createMrzParserService } from "./mrz_parser_service";
import { createMrzChecksumValidator } from "./mrz_checksum_validator";
import { createFieldNormalizationService } from "./field_normalization_service";
import { createOcrConfidenceService } from "./ocr_confidence_service";
import { createStaffReviewService } from "./staff_review_service";
import { PaddleOcrEngine } from "../ocr/paddle_ocr_engine";
import { TesseractOcrEngine } from "../ocr/tesseract_ocr_engine";
import { logger } from "../lib/logger";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";

export type OcrPipelineError =
  | "BLURRY_IMAGE"
  | "GLARE_REFLECTION"
  | "DOCUMENT_NOT_DETECTED"
  | "MRZ_NOT_FOUND"
  | "OCR_CONFIDENCE_TOO_LOW"
  | "INVALID_MRZ_CHECKSUM"
  | "EXPIRED_DOCUMENT"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "PADDLE_OCR_UNAVAILABLE"
  | "TESSERACT_FALLBACK_UNAVAILABLE"
  | "STAFF_CANCELLED_REVIEW"
  | "PIPELINE_FAILED";

export type PipelineStage =
  | "QUALITY_CHECK"
  | "DOCUMENT_CROP"
  | "PREPROCESSING"
  | "MRZ_DETECTION"
  | "OCR"
  | "MRZ_PARSE"
  | "CHECKSUM_VALIDATION"
  | "FIELD_NORMALIZATION"
  | "CONFIDENCE_SCORING"
  | "STAFF_REVIEW";

export type PipelineProgress = {
  stage: PipelineStage;
  message: string;
  progress: number;
};

export type PipelineCallbacks = {
  onProgress?: (progress: PipelineProgress) => void;
};

export interface OcrPipelineService {
  runOcrPipeline(image: ImageInput, callbacks?: PipelineCallbacks): Promise<ConfirmedFields>;
}

const OCR_CONFIDENCE_THRESHOLD = 0.6;

export function createOcrPipelineService(
  imageQuality?: ImageQualityService,
  documentCrop?: DocumentCropService,
  imagePreprocessing?: ImagePreprocessingService,
  mrzDetection?: MrzDetectionService,
  paddleOcr?: OcrEngine,
  tesseractOcr?: OcrEngine,
  mrzParser?: MrzParserService,
  checksumValidator?: MrzChecksumValidator,
  fieldNormalization?: FieldNormalizationService,
  confidenceService?: OcrConfidenceService,
  staffReview?: StaffReviewService,
): OcrPipelineService {
  return new DefaultOcrPipelineService(
    imageQuality ?? createImageQualityService(),
    documentCrop ?? createDocumentCropService(),
    imagePreprocessing ?? createImagePreprocessingService(),
    mrzDetection ?? createMrzDetectionService(),
    paddleOcr ?? new PaddleOcrEngine(),
    tesseractOcr ?? new TesseractOcrEngine(),
    mrzParser ?? createMrzParserService(),
    checksumValidator ?? createMrzChecksumValidator(),
    fieldNormalization ?? createFieldNormalizationService(),
    confidenceService ?? createOcrConfidenceService(),
    staffReview ?? createStaffReviewService(),
  );
}

class DefaultOcrPipelineService implements OcrPipelineService {
  constructor(
    private readonly imageQuality: ImageQualityService,
    private readonly documentCrop: DocumentCropService,
    private readonly imagePreprocessing: ImagePreprocessingService,
    private readonly mrzDetection: MrzDetectionService,
    private readonly paddleOcr: OcrEngine,
    private readonly tesseractOcr: OcrEngine,
    private readonly mrzParser: MrzParserService,
    private readonly checksumValidator: MrzChecksumValidator,
    private readonly fieldNormalization: FieldNormalizationService,
    private readonly confidenceService: OcrConfidenceService,
    private readonly staffReview: StaffReviewService,
  ) {}

  async runOcrPipeline(image: ImageInput, callbacks?: PipelineCallbacks): Promise<ConfirmedFields> {
    this.emitProgress(callbacks, "QUALITY_CHECK", "Analyzing image quality...", 5);

    const qualityResult = await this.imageQuality.analyzeImage(image);
    if (!qualityResult.passed) {
      logger.warn("OcrPipelineService: image quality check failed", {
        warnings: qualityResult.warnings,
      });
      throw Object.assign(new Error(`Image quality check failed: ${qualityResult.warnings.join(", ")}`), {
        type: qualityResult.warnings[0] === "BLURRY" ? "BLURRY_IMAGE" : ("GLARE_REFLECTION" as OcrPipelineError),
      });
    }

    this.emitProgress(callbacks, "DOCUMENT_CROP", "Cropping document...", 20);

    let cropped: CroppedImage;
    try {
      cropped = await this.documentCrop.cropDocument(image);
    } catch (error) {
      logger.warn("OcrPipelineService: document crop failed", error);
      throw Object.assign(error instanceof Error ? error : new Error("DOCUMENT_NOT_DETECTED"), {
        type: "DOCUMENT_NOT_DETECTED" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "PREPROCESSING", "Deskewing and preprocessing...", 35);

    let preprocessed: PreprocessedImage;
    try {
      preprocessed = await this.imagePreprocessing.preprocessImage(cropped);
    } catch (error) {
      logger.error("OcrPipelineService: preprocessing failed", error);
      throw Object.assign(error instanceof Error ? error : new Error("PIPELINE_FAILED"), {
        type: "PIPELINE_FAILED" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "MRZ_DETECTION", "Detecting MRZ region...", 50);

    let mrzRegion: MrzRegion;
    try {
      mrzRegion = await this.mrzDetection.detectMrzRegion(preprocessed);
    } catch (error) {
      logger.warn("OcrPipelineService: MRZ detection failed", error);
      throw Object.assign(error instanceof Error ? error : new Error("MRZ_NOT_FOUND"), {
        type: "MRZ_NOT_FOUND" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "OCR", "Running OCR on MRZ region...", 60);

    const ocrInput: OcrInput = { imagePath: mrzRegion.imagePath };

    let ocrResult: OcrTextResult;
    let usedFallback = false;

    try {
      ocrResult = await this.paddleOcr.extractText(ocrInput);
    } catch (error) {
      logger.warn("OcrPipelineService: PaddleOCR unavailable, attempting Tesseract fallback", error);

      try {
        ocrResult = await this.tesseractOcr.extractText(ocrInput);
        usedFallback = true;
      } catch (fallbackError) {
        logger.error("OcrPipelineService: Tesseract fallback also unavailable", fallbackError);
        throw Object.assign(new Error("TESSERACT_FALLBACK_UNAVAILABLE"), {
          type: "TESSERACT_FALLBACK_UNAVAILABLE" as OcrPipelineError,
        });
      }
    }

    if (!usedFallback && ocrResult.averageConfidence < OCR_CONFIDENCE_THRESHOLD) {
      logger.info("OcrPipelineService: PaddleOCR confidence low, trying Tesseract fallback", {
        paddleConfidence: ocrResult.averageConfidence,
      });

      try {
        const fallbackResult = await this.tesseractOcr.extractText(ocrInput);
        if (fallbackResult.averageConfidence > ocrResult.averageConfidence) {
          ocrResult = fallbackResult;
          usedFallback = true;
        }
      } catch {
        logger.warn("OcrPipelineService: Tesseract fallback failed, keeping PaddleOCR result");
      }
    }

    if (ocrResult.averageConfidence < OCR_CONFIDENCE_THRESHOLD) {
      logger.warn("OcrPipelineService: all OCR results below confidence threshold", {
        confidence: ocrResult.averageConfidence,
      });
      throw Object.assign(new Error("OCR_CONFIDENCE_TOO_LOW"), {
        type: "OCR_CONFIDENCE_TOO_LOW" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "MRZ_PARSE", "Parsing MRZ text...", 75);

    const mrzLines = ocrResult.lines.map((l) => l.text);
    const parseResult: MrzParseResult = this.mrzParser.parseMrzLines(mrzLines);

    if (!parseResult.passportNumber && !parseResult.surname && !parseResult.givenName) {
      logger.warn("OcrPipelineService: MRZ parsing produced no usable fields", {
        rawLines: mrzLines,
      });
      throw Object.assign(new Error("MRZ_NOT_FOUND"), {
        type: "MRZ_NOT_FOUND" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "CHECKSUM_VALIDATION", "Validating MRZ checksums...", 80);

    const checksumResult: MrzChecksumValidationResult = this.checksumValidator.validateChecksums(mrzLines);

    logger.info("OcrPipelineService: MRZ checksum validation", {
      overallValid: checksumResult.overallValid,
      errors: checksumResult.errors.length > 0 ? checksumResult.errors : undefined,
    });

    this.emitProgress(callbacks, "FIELD_NORMALIZATION", "Normalizing extracted fields...", 85);

    const mrzParsedFields: MrzParsedFields = this.mapParseResultToMrzParsedFields(
      parseResult,
      ocrResult,
      checksumResult,
    );

    const normalizedFields: NormalizedFields = this.fieldNormalization.normalizeFields(mrzParsedFields);

    this.emitProgress(callbacks, "CONFIDENCE_SCORING", "Calculating confidence scores...", 90);

    const confidenceScores: FieldConfidenceScores = this.confidenceService.calculateConfidence(
      normalizedFields,
      ocrResult,
      parseResult.checkDigits,
    );

    this.emitProgress(callbacks, "STAFF_REVIEW", "Awaiting staff review...", 95);

    const pending: PendingReview = await this.staffReview.reviewResult(normalizedFields, confidenceScores);

    logger.info("OcrPipelineService: staff review ready", {
      lowConfidenceFields: pending.lowConfidenceFields,
      usedFallback,
      maskedName: maskFullName(normalizedFields.fullName),
      maskedPassport: maskPassportNumber(normalizedFields.passportNumber),
    });

    let confirmed: ConfirmedFields;
    try {
      confirmed = await this.staffReview.confirmResult(pending);
    } catch (error) {
      logger.warn("OcrPipelineService: staff cancelled review", error);
      this.staffReview.cancelReview(pending);
      throw Object.assign(new Error("STAFF_CANCELLED_REVIEW"), {
        type: "STAFF_CANCELLED_REVIEW" as OcrPipelineError,
      });
    }

    this.emitProgress(callbacks, "STAFF_REVIEW", "OCR pipeline complete", 100);

    logger.info("OcrPipelineService: pipeline completed successfully", {
      confirmedBy: confirmed.confirmedBy,
      lowConfidenceFields: confirmed.lowConfidenceFields,
      maskedName: maskFullName(confirmed.fields.fullName),
    });

    return confirmed;
  }

  private emitProgress(
    callbacks: PipelineCallbacks | undefined,
    stage: PipelineStage,
    message: string,
    progress: number,
  ): void {
    callbacks?.onProgress?.({ stage, message, progress });
  }

  private mapParseResultToMrzParsedFields(
    parseResult: MrzParseResult,
    ocrResult: OcrTextResult,
    checksumResult: MrzChecksumValidationResult,
  ): MrzParsedFields {
    const checkDigits: Record<string, boolean> = {
      passport_number_valid: checksumResult.passportNumberValid,
      date_of_birth_valid: checksumResult.dateOfBirthValid,
      expiry_date_valid: checksumResult.expiryDateValid,
      optional_data_valid: checksumResult.optionalDataValid,
      final_composite_valid: checksumResult.finalCompositeValid,
      overall_valid: checksumResult.overallValid,
      ...parseResult.checkDigits,
    };

    return {
      fullName: parseResult.fullName,
      surname: parseResult.surname,
      givenName: parseResult.givenName,
      gender: parseResult.gender,
      dateOfBirth: parseResult.dateOfBirth,
      nationality: parseResult.nationality,
      issuingCountry: parseResult.issuingCountry,
      documentType: parseResult.documentType,
      passportNumber: parseResult.passportNumber,
      documentNumber: parseResult.passportNumber,
      idNumber: parseResult.optionalData,
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: ocrResult.lines.map((l) => l.text),
      checkDigits,
    };
  }
}
