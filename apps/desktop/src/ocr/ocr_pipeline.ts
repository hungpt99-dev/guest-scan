import type { ImageInput, ImageQualityService, ImageQualityResult } from "../services/image_quality_service";
import { createImageQualityService } from "../services/image_quality_service";
import type { DocumentDetectorService, DocumentCorrectionResult } from "../services/document_detector";
import { createDocumentDetectorService } from "../services/document_detector";
import type { MrzCropperService, MrzCropResult } from "../services/mrz_cropper";
import { createMrzCropperService } from "../services/mrz_cropper";
import type { MrzOcrService, MrzOcrResult } from "../services/mrz_ocr_service";
import { createMrzOcrService } from "../services/mrz_ocr_service";
import type { OcrPipelineService, PipelineCallbacks } from "../services/ocr_pipeline_service";
import type { OcrEngine, OcrInput, OcrTextResult } from "./ocr_engine";
import { createOcrPipelineService } from "../services/ocr_pipeline_service";
import type { ConfirmedFields } from "../services/staff_review_service";
import type { FieldValidatorService, FieldValidationResult } from "../services/field_validator";
import { createFieldValidatorService } from "../services/field_validator";
import type { VisualOcrService, VisualOcrResult } from "../services/visual_ocr_service";
import { createVisualOcrService } from "../services/visual_ocr_service";
import type { FieldResolverService, FieldResolverResult } from "../services/field_resolver";
import { createFieldResolverService } from "../services/field_resolver";
import type {
  OcrConfidenceService,
  FieldConfidenceScores,
  OverallConfidence,
} from "../services/ocr_confidence_service";
import { createOcrConfidenceService } from "../services/ocr_confidence_service";
import type { ReviewService } from "../services/review_service";
import { createReviewService } from "../services/review_service";
import type { OcrWarningService } from "../services/ocr_warning_service";
import { createOcrWarningService } from "../services/ocr_warning_service";
import type { OcrWarning } from "../services/ocr_warning_service";
import type { OcrProvider } from "../services/ocr_provider";
import {
  createPaddleOcrProvider,
  DEFAULT_MRZ_OCR_SETTINGS,
  DEFAULT_VISUAL_OCR_SETTINGS,
} from "../services/ocr_provider";
import { logger } from "../lib/logger";
import type { AuditLoggerService, AuditLogSession } from "../services/audit_logger";
import { createAuditLoggerService } from "../services/audit_logger";

export type PipelineResultStatus = "AUTO_FILLED" | "NEED_REVIEW" | "FAILED";

export type PipelineResult = {
  status: PipelineResultStatus;
  confirmed?: ConfirmedFields;
  qualityResult?: ImageQualityResult;
  documentResult?: DocumentCorrectionResult;
  mrzCropResult?: MrzCropResult;
  mrzOcrResult?: MrzOcrResult;
  visualOcrResult?: VisualOcrResult;
  ocrWarnings: OcrWarning[];
  fieldConfidenceScores?: FieldConfidenceScores;
  overallConfidence?: OverallConfidence;
  error?: string;
};

const imageQualityService: ImageQualityService = createImageQualityService();
const documentDetectorService: DocumentDetectorService = createDocumentDetectorService();
const mrzCropperService: MrzCropperService = createMrzCropperService();

const ocrProvider: OcrProvider = createPaddleOcrProvider({
  mrzSettings: DEFAULT_MRZ_OCR_SETTINGS,
  visualSettings: DEFAULT_VISUAL_OCR_SETTINGS,
  enableFallback: true,
});

class ProviderOcrEngineAdapter implements OcrEngine {
  private provider: OcrProvider;
  constructor(provider: OcrProvider) {
    this.provider = provider;
  }

  async extractText(input: OcrInput): Promise<OcrTextResult> {
    const result = await this.provider.extractText(input.imagePath, "MRZ", {
      language: "eng",
      confidenceThreshold: 0.6,
      maxImageWidth: 2048,
      useOrientationClassification: true,
      orientationMode: "CLASSIFY_AND_ROTATE",
      useDocumentCorrection: true,
      useImageUnwarping: false,
      enableGpu: false,
      preprocessingSteps: ["grayscale", "denoise", "contrast_enhance"],
    });
    return {
      lines: result.lines.map((l: { text: string; confidence: number }) => ({
        text: l.text,
        confidence: l.confidence,
      })),
      fullText: result.fullText,
      averageConfidence: result.averageConfidence,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }
}

const paddleEngine: OcrEngine = new ProviderOcrEngineAdapter(ocrProvider);

const mrzOcrService: MrzOcrService = createMrzOcrService(paddleEngine, undefined, undefined, {
  confidenceThreshold: 0.3,
  validationWeight: 0.5,
  confidenceWeight: 0.5,
});

const ocrPipelineService: OcrPipelineService = createOcrPipelineService();
const fieldValidator: FieldValidatorService = createFieldValidatorService();

const visualOcrService: VisualOcrService = createVisualOcrService(paddleEngine, undefined, {
  enabled: true,
  zoneDefinitions: DEFAULT_VISUAL_OCR_SETTINGS.zoneDefinitions,
  minOcrConfidence: 0.5,
});

const fieldResolver: FieldResolverService = createFieldResolverService();
const confidenceService: OcrConfidenceService = createOcrConfidenceService();
const reviewService: ReviewService = createReviewService();
const auditLogger: AuditLoggerService = createAuditLoggerService();

function getValidationWarnings(validationResults: FieldValidationResult[]): OcrWarning[] {
  const warnings: OcrWarning[] = [];
  for (const result of validationResults) {
    for (const issue of result.issues) {
      if (issue.code === "COUNTRY_CODE_REPAIRED" && !warnings.includes("COUNTRY_CODE_REPAIRED")) {
        warnings.push("COUNTRY_CODE_REPAIRED");
      }
      if (issue.code === "AMBIGUOUS_CHARS" && !warnings.includes("PASSPORT_NUMBER_REPAIRED")) {
        warnings.push("PASSPORT_NUMBER_REPAIRED");
      }
      if (
        (issue.code === "TRAILING_OCR_NOISE" || issue.code === "GENDER_UNKNOWN") &&
        !warnings.includes("LOW_CONFIDENCE_FIELD")
      ) {
        warnings.push("LOW_CONFIDENCE_FIELD");
      }
    }
    if (result.needsReview && !warnings.includes("HUMAN_REVIEW_REQUIRED")) {
      const nonTrivialIssues = result.issues.some(
        (i) => i.code !== "COUNTRY_CODE_REPAIRED" && i.code !== "TRAILING_OCR_NOISE" && i.code !== "GENDER_UNKNOWN",
      );
      if (nonTrivialIssues) {
        warnings.push("HUMAN_REVIEW_REQUIRED");
      }
    }
  }
  return warnings;
}

export async function runOcrPipeline(image: ImageInput, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
  const ocrWarningService: OcrWarningService = createOcrWarningService();
  let pipelineSession: AuditLogSession | undefined;

  if (auditLogger.isDebugMode()) {
    pipelineSession = auditLogger.startSession(image.imagePath);
    auditLogger.addArtifact(pipelineSession, {
      type: "original_image",
      imagePath: image.imagePath,
      filePath: image.imagePath,
    });
  }

  logger.info("OcrPipeline: starting quality check", {
    imagePath: image.imagePath.replace(/\/[^/]+\.\w+$/, "/***"),
  });

  let qualityResult: ImageQualityResult;
  try {
    qualityResult = await imageQualityService.analyzeImage(image);
  } catch (error) {
    logger.error("OcrPipeline: quality check failed with error", error);
    if (pipelineSession) auditLogger.finalizeSession(pipelineSession);
    return {
      status: "FAILED",
      ocrWarnings: ["HUMAN_REVIEW_REQUIRED"],
      error: error instanceof Error ? error.message : "Quality check error",
    };
  }

  logger.info("OcrPipeline: quality check complete", {
    passed: qualityResult.passed,
    status: qualityResult.status,
    warnings: qualityResult.warnings,
    ocrWarnings: qualityResult.ocrWarnings,
  });

  if (qualityResult.status === "FAILED") {
    logger.warn("OcrPipeline: image quality FAILED, aborting pipeline", {
      warnings: qualityResult.warnings,
    });
    if (pipelineSession) auditLogger.finalizeSession(pipelineSession);
    return {
      status: "FAILED",
      qualityResult,
      ocrWarnings: qualityResult.ocrWarnings,
      error: `Image quality failed: ${qualityResult.warnings.join(", ")}`,
    };
  }

  logger.info("OcrPipeline: running document detection and correction");

  let documentResult: DocumentCorrectionResult;
  let correctedImage: ImageInput;
  let mrzCropResult: MrzCropResult | undefined;
  ocrWarningService.addAll(qualityResult.ocrWarnings);

  try {
    documentResult = await documentDetectorService.detectAndCorrect(image);
    correctedImage = { imagePath: documentResult.correctedImagePath };

    logger.info("OcrPipeline: document detection complete", {
      detected: documentResult.detected,
      perspectiveCorrected: documentResult.perspectiveCorrected,
      deskewAngle: documentResult.deskewAngle,
      transformsApplied: documentResult.transformsApplied,
    });

    if (pipelineSession) {
      auditLogger.addArtifact(pipelineSession, {
        type: "corrected_document",
        imagePath: documentResult.correctedImagePath,
        filePath: documentResult.correctedImagePath,
        width: documentResult.width,
        height: documentResult.height,
      });
    }

    if (!documentResult.detected) {
      ocrWarningService.add("DOCUMENT_NOT_FULLY_VISIBLE");
      correctedImage = image;
    }

    if (documentResult.deskewAngle > 3) {
      ocrWarningService.add("STRONG_ROTATION");
    }
  } catch (error) {
    logger.warn("OcrPipeline: document detection failed, using original image", error);
    documentResult = {
      correctedImagePath: image.imagePath,
      originalImagePath: image.imagePath,
      detected: false,
      bounds: null,
      perspectiveCorrected: false,
      deskewAngle: 0,
      width: 0,
      height: 0,
      originalWidth: 0,
      originalHeight: 0,
      transformsApplied: [],
    };
    correctedImage = image;
    ocrWarningService.add("DOCUMENT_NOT_FULLY_VISIBLE");
  }

  logger.info("OcrPipeline: cropping MRZ zone from corrected image");

  try {
    mrzCropResult = await mrzCropperService.cropMrzZone(correctedImage);

    logger.info("OcrPipeline: MRZ zone cropped", {
      detected: mrzCropResult.detected,
      format: mrzCropResult.detectedFormat,
      confidence: mrzCropResult.confidence,
      variantCount: mrzCropResult.variants.length,
    });

    if (pipelineSession) {
      auditLogger.addArtifact(pipelineSession, {
        type: "mrz_crop",
        imagePath: mrzCropResult.croppedImagePath,
        filePath: mrzCropResult.croppedImagePath,
        boundingBox: mrzCropResult.boundingBox,
      });
      for (const v of mrzCropResult.variants) {
        auditLogger.addArtifact(pipelineSession, {
          type: "mrz_crop",
          imagePath: v.imagePath,
          filePath: v.imagePath,
          variantName: v.name,
        });
      }
    }

    if (!mrzCropResult.detected) {
      ocrWarningService.add("MRZ_NOT_FOUND");
    }
  } catch (error) {
    logger.warn("OcrPipeline: MRZ cropping failed, proceeding with full image", error);
    ocrWarningService.add("MRZ_NOT_FOUND");
  }

  let mrzOcrResult: MrzOcrResult | undefined;

  if (mrzCropResult && mrzCropResult.detected && mrzCropResult.variants.length > 0) {
    logger.info("OcrPipeline: running MRZ OCR on preprocessing variants", {
      variantCount: mrzCropResult.variants.length,
      variantNames: mrzCropResult.variants.map((v) => v.name),
    });

    try {
      mrzOcrResult = await mrzOcrService.runMrzOcrVariants(mrzCropResult);

      logger.info("OcrPipeline: MRZ OCR complete", {
        bestVariant: mrzOcrResult.bestResult.variantName,
        totalScore: mrzOcrResult.bestResult.totalScore,
        confidence: mrzOcrResult.bestResult.averageConfidence,
        validationScore: mrzOcrResult.bestResult.validationScore,
        mrzDetected: mrzOcrResult.mrzDetected,
        variantsProcessed: mrzOcrResult.allResults.length,
      });

      if (pipelineSession) {
        for (const r of mrzOcrResult.allResults) {
          auditLogger.addArtifact(pipelineSession, {
            type: "mrz_cleaned_text",
            variantName: r.variantName,
            rawText: r.rawText,
            cleanedText: r.cleanedText,
            lines: r.lines,
          });
          auditLogger.addArtifact(pipelineSession, {
            type: "ocr_raw_text",
            source: "mrz",
            text: r.rawText,
            confidence: r.averageConfidence,
            variantName: r.variantName,
            lines: r.lines,
          });
        }
        auditLogger.addArtifact(pipelineSession, {
          type: "check_digit_results",
          results: mrzOcrResult.bestResult.mrzParseResult.checkDigits,
          overallValid: Object.values(mrzOcrResult.bestResult.mrzParseResult.checkDigits).every(Boolean),
        });
      }

      if (!mrzOcrResult.mrzDetected) {
        ocrWarningService.add("MRZ_NOT_FOUND");
      }
    } catch (error) {
      logger.error("OcrPipeline: MRZ OCR failed", error);
      ocrWarningService.add("MRZ_NOT_FOUND");
    }
  }

  let visualOcrResult: VisualOcrResult | undefined;

  if (mrzOcrResult && mrzOcrResult.mrzDetected && documentResult.detected) {
    logger.info("OcrPipeline: running visual zone OCR for conflict resolution");

    const mrzValues: Record<string, string> = {
      surname: mrzOcrResult.bestResult.mrzParseResult.surname,
      givenName: mrzOcrResult.bestResult.mrzParseResult.givenName,
      fullName: mrzOcrResult.bestResult.mrzParseResult.fullName,
      passportNumber: mrzOcrResult.bestResult.mrzParseResult.passportNumber,
      nationality: mrzOcrResult.bestResult.mrzParseResult.nationality,
      dateOfBirth: mrzOcrResult.bestResult.mrzParseResult.dateOfBirth,
      gender: mrzOcrResult.bestResult.mrzParseResult.gender,
      expiryDate: mrzOcrResult.bestResult.mrzParseResult.expiryDate,
      issuingCountry: mrzOcrResult.bestResult.mrzParseResult.issuingCountry,
      documentType: mrzOcrResult.bestResult.mrzParseResult.documentType,
      idNumber: mrzOcrResult.bestResult.mrzParseResult.optionalData,
    };

    const mrzCheckDigits = mrzOcrResult.bestResult.mrzParseResult.checkDigits;

    try {
      visualOcrResult = await visualOcrService.runVisualOcr(correctedImage.imagePath, mrzValues, mrzCheckDigits);

      if (visualOcrResult.hasConflicts) {
        ocrWarningService.add("VISUAL_MRZ_CONFLICT");
      }

      if (visualOcrResult.visualConfidence < 0.5) {
        ocrWarningService.add("LOW_CONFIDENCE_FIELD");
      }

      if (pipelineSession) {
        for (const f of visualOcrResult.fieldResults) {
          if (f.croppedImagePath) {
            auditLogger.addArtifact(pipelineSession, {
              type: "visual_field_crop",
              fieldName: f.fieldName,
              imagePath: f.croppedImagePath,
              filePath: f.croppedImagePath,
            });
          }
          auditLogger.addArtifact(pipelineSession, {
            type: "ocr_raw_text",
            source: "visual",
            text: f.rawValue,
            confidence: f.confidence,
          });
        }
      }

      logger.info("OcrPipeline: visual OCR complete", {
        conflictsFound: visualOcrResult.fieldConflicts.filter((c) => c.hasConflict).length,
        visualConfidence: visualOcrResult.visualConfidence,
        warnings: visualOcrResult.warnings,
      });
    } catch (error) {
      logger.warn("OcrPipeline: visual OCR failed, proceeding without conflict resolution", error);
    }
  }

  const mrzParseResult = mrzOcrResult?.bestResult?.mrzParseResult;

  let fieldResolverResult: FieldResolverResult | undefined;
  if (mrzParseResult) {
    fieldResolverResult = fieldResolver.resolveFields({
      mrzParseResult,
      visualOcrResult,
      validationResults: [],
    });
    ocrWarningService.addAll(fieldResolverResult.ocrWarnings);

    if (pipelineSession) {
      const finalValues: Record<string, string> = {};
      if (fieldResolverResult.resolvedFields) {
        for (const [key, field] of Object.entries(fieldResolverResult.resolvedFields)) {
          finalValues[key] = field.value;
        }
      }
      auditLogger.addArtifact(pipelineSession, {
        type: "final_selected_values",
        values: finalValues,
      });
    }
  }

  if (qualityResult.status === "NEED_REVIEW") {
    logger.warn("OcrPipeline: image quality needs review, proceeding with caution", {
      warnings: qualityResult.warnings,
    });

    try {
      const confirmed = await ocrPipelineService.runOcrPipeline(correctedImage, callbacks);

      const validationResults = fieldValidator.validateExtractedFields({
        fullName: confirmed.fields.fullName,
        surname: confirmed.fields.lastName,
        givenName: confirmed.fields.firstName,
        passportNumber: confirmed.fields.passportNumber,
        nationality: confirmed.fields.nationality,
        dateOfBirth: confirmed.fields.dateOfBirth,
        expiryDate: confirmed.fields.expiryDate,
        gender: confirmed.fields.gender,
        issuingCountry: confirmed.fields.issuingCountry,
        documentType: confirmed.fields.documentType,
        idNumber: confirmed.fields.idNumber,
      });

      const validationWarnings = getValidationWarnings(validationResults);
      ocrWarningService.addAll(validationWarnings);

      if (visualOcrResult?.hasConflicts && !ocrWarningService.has("VISUAL_MRZ_CONFLICT")) {
        ocrWarningService.add("VISUAL_MRZ_CONFLICT");
      }

      const earlyReviewResult = reviewService.determineReviewStatus({
        resolvedFields: fieldResolverResult?.resolvedFields,
        overallConfidence: fieldResolverResult?.overallConfidence ?? 0,
        overallLevel: fieldResolverResult?.overallLevel ?? "LOW",
        ocrWarnings: ocrWarningService.getWarnings(),
        mrzDetected: mrzOcrResult?.mrzDetected ?? false,
        documentDetected: documentResult.detected,
        qualityStatus: qualityResult.status,
        fieldValidationResults: validationResults,
      });

      if (pipelineSession) {
        auditLogger.addArtifact(pipelineSession, {
          type: "warning_list",
          warnings: ocrWarningService.getWarnings(),
        });
        auditLogger.finalizeSession(pipelineSession);
      }

      return {
        status: earlyReviewResult.status as PipelineResultStatus,
        confirmed,
        qualityResult,
        documentResult,
        mrzCropResult,
        mrzOcrResult,
        visualOcrResult,
        ocrWarnings: ocrWarningService.getWarnings(),
      };
    } catch (error) {
      logger.warn("OcrPipeline: OCR pipeline failed after quality warning", error);
      ocrWarningService.add("HUMAN_REVIEW_REQUIRED");
      if (pipelineSession) {
        auditLogger.addArtifact(pipelineSession, {
          type: "warning_list",
          warnings: ocrWarningService.getWarnings(),
        });
        auditLogger.finalizeSession(pipelineSession);
      }
      return {
        status: "NEED_REVIEW",
        qualityResult,
        documentResult,
        mrzCropResult,
        mrzOcrResult,
        visualOcrResult,
        ocrWarnings: ocrWarningService.getWarnings(),
        error: error instanceof Error ? error.message : "Pipeline error",
      };
    }
  }

  try {
    const confirmed = await ocrPipelineService.runOcrPipeline(correctedImage, callbacks);

    const validationResults = fieldValidator.validateExtractedFields({
      fullName: confirmed.fields.fullName,
      surname: confirmed.fields.lastName,
      givenName: confirmed.fields.firstName,
      passportNumber: confirmed.fields.passportNumber,
      nationality: confirmed.fields.nationality,
      dateOfBirth: confirmed.fields.dateOfBirth,
      expiryDate: confirmed.fields.expiryDate,
      gender: confirmed.fields.gender,
      issuingCountry: confirmed.fields.issuingCountry,
      documentType: confirmed.fields.documentType,
      idNumber: confirmed.fields.idNumber,
    });

    const validationWarnings = getValidationWarnings(validationResults);
    ocrWarningService.addAll(validationWarnings);

    if (mrzParseResult && fieldResolverResult) {
      fieldResolverResult = fieldResolver.resolveFields({
        mrzParseResult,
        visualOcrResult,
        validationResults,
      });
      ocrWarningService.addAll(fieldResolverResult.ocrWarnings);
    }

    let fieldConfidenceScores: FieldConfidenceScores | undefined;
    let overallConfidence: OverallConfidence | undefined;
    if (mrzParseResult && mrzOcrResult && confirmed) {
      const mrzBest = mrzOcrResult.bestResult;
      const ocrTextResult: OcrTextResult = {
        lines: mrzBest.lines.map((text) => ({ text, confidence: mrzBest.averageConfidence })),
        fullText: mrzBest.rawText,
        averageConfidence: mrzBest.averageConfidence,
      };
      fieldConfidenceScores = confidenceService.calculateConfidence(
        confirmed.fields,
        ocrTextResult,
        mrzParseResult.checkDigits,
      );
      overallConfidence = confidenceService.calculateOverallConfidence(fieldConfidenceScores);

      logger.info("OcrPipeline: confidence scoring complete", {
        overallScore: overallConfidence.overallScore,
        overallLevel: overallConfidence.overallLevel,
        fieldCount: overallConfidence.fieldCount,
        validFieldCount: overallConfidence.validFieldCount,
      });

      if (pipelineSession) {
        const fieldScores: Record<string, { score: number; level: string; issues: string[] }> = {};
        for (const [key, score] of Object.entries(fieldConfidenceScores)) {
          fieldScores[key] = { score: score.score, level: score.level, issues: score.issues };
        }
        auditLogger.addArtifact(pipelineSession, {
          type: "confidence_details",
          fieldScores,
          overall: {
            overallScore: overallConfidence.overallScore,
            overallLevel: overallConfidence.overallLevel,
            fieldCount: overallConfidence.fieldCount,
            validFieldCount: overallConfidence.validFieldCount,
          },
        });
      }
    }

    const reviewResult = reviewService.determineReviewStatus({
      resolvedFields: fieldResolverResult?.resolvedFields,
      overallConfidence: overallConfidence?.overallScore ?? 0,
      overallLevel: overallConfidence?.overallLevel ?? "LOW",
      ocrWarnings: ocrWarningService.getWarnings(),
      mrzDetected: mrzOcrResult?.mrzDetected ?? false,
      documentDetected: documentResult.detected,
      qualityStatus: qualityResult.status,
      fieldValidationResults: validationResults,
    });

    if (pipelineSession) {
      auditLogger.addArtifact(pipelineSession, {
        type: "warning_list",
        warnings: ocrWarningService.getWarnings(),
      });
      auditLogger.finalizeSession(pipelineSession);
    }

    return {
      status: reviewResult.status as PipelineResultStatus,
      confirmed,
      qualityResult,
      documentResult,
      mrzCropResult,
      mrzOcrResult,
      visualOcrResult,
      ocrWarnings: ocrWarningService.getWarnings(),
      fieldConfidenceScores,
      overallConfidence,
    };
  } catch (error) {
    logger.error("OcrPipeline: OCR pipeline failed", error);
    if (pipelineSession) {
      auditLogger.addArtifact(pipelineSession, {
        type: "warning_list",
        warnings: ocrWarningService.getWarnings(),
      });
      auditLogger.finalizeSession(pipelineSession);
    }
    return {
      status: "FAILED",
      qualityResult,
      documentResult,
      mrzCropResult,
      mrzOcrResult,
      visualOcrResult,
      ocrWarnings: ocrWarningService.getWarnings(),
      error: error instanceof Error ? error.message : "Pipeline error",
    };
  }
}
