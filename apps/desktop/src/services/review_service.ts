import type { ResolvedFields, ResolvedField } from "./field_resolver";
import type { FieldValidationResult } from "./field_validator";
import type { OcrWarning, QualityStatus } from "./image_quality_service";
import { logger } from "../lib/logger";

export type ReviewStatus = "AUTO_FILLED" | "NEED_REVIEW" | "FAILED";

export type OverallConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "FAILED";

export type ReviewStatusReasonCode =
  | "ALL_CRITICAL_FIELDS_EMPTY"
  | "QUALITY_CHECK_FAILED"
  | "QUALITY_NEEDS_REVIEW"
  | "MRZ_NOT_FOUND"
  | "DOCUMENT_NOT_DETECTED"
  | "FIELD_NEEDS_REVIEW"
  | "FIELD_UNRESOLVED"
  | "VISUAL_MRZ_CONFLICT"
  | "OVERALL_CONFIDENCE_LOW"
  | "VALIDATION_ERRORS"
  | "CRITICAL_WARNINGS"
  | "SOME_CRITICAL_FIELDS_EMPTY"
  | "PIPELINE_ERROR";

export type ReviewStatusReason = {
  code: ReviewStatusReasonCode;
  field?: string;
  message: string;
};

export type ReviewStatusResult = {
  status: ReviewStatus;
  reasons: ReviewStatusReason[];
};

export type DetermineReviewStatusParams = {
  resolvedFields?: ResolvedFields;
  overallConfidence: number;
  overallLevel: OverallConfidenceLevel;
  ocrWarnings: OcrWarning[];
  mrzDetected: boolean;
  documentDetected: boolean;
  qualityStatus: QualityStatus;
  fieldValidationResults: FieldValidationResult[];
  pipelineError?: string;
};

export interface ReviewService {
  determineReviewStatus(params: DetermineReviewStatusParams): ReviewStatusResult;
}

const CRITICAL_FIELDS: (keyof ResolvedFields)[] = ["passportNumber", "fullName", "dateOfBirth", "expiryDate"];

function hasErrorValidation(results: FieldValidationResult[]): boolean {
  return results.some((r) => r.issues.some((i) => i.severity === "error"));
}

function hasNeedsReviewField(resolved: ResolvedFields): ReviewStatusReason | null {
  for (const [key, field] of Object.entries(resolved) as [keyof ResolvedFields, ResolvedField][]) {
    if (field.needsReview && field.source !== "unresolved" && field.value.length > 0) {
      return { code: "FIELD_NEEDS_REVIEW", field: key, message: `Field '${key}' requires review` };
    }
  }
  return null;
}

function hasUnresolvedField(resolved: ResolvedFields): ReviewStatusReason | null {
  for (const [key, field] of Object.entries(resolved) as [keyof ResolvedFields, ResolvedField][]) {
    if (field.source === "unresolved") {
      return { code: "FIELD_UNRESOLVED", field: key, message: `Field '${key}' could not be resolved` };
    }
  }
  return null;
}

function countEmptyCritical(resolved: ResolvedFields): number {
  return CRITICAL_FIELDS.filter((name) => !resolved[name]?.value).length;
}

function hasWarning(warnings: OcrWarning[], target: OcrWarning): boolean {
  return warnings.includes(target);
}

export function createReviewService(): ReviewService {
  return new DefaultReviewService();
}

class DefaultReviewService implements ReviewService {
  determineReviewStatus(params: DetermineReviewStatusParams): ReviewStatusResult {
    const {
      resolvedFields,
      overallConfidence,
      overallLevel,
      ocrWarnings,
      mrzDetected,
      documentDetected,
      qualityStatus,
      fieldValidationResults,
      pipelineError,
    } = params;

    const reasons: ReviewStatusReason[] = [];

    if (pipelineError) {
      reasons.push({ code: "PIPELINE_ERROR", message: pipelineError });
      logger.warn("ReviewService: FAILED due to pipeline error", { error: pipelineError });
      return { status: "FAILED", reasons };
    }

    if (qualityStatus === "FAILED") {
      reasons.push({ code: "QUALITY_CHECK_FAILED", message: "Image quality check failed" });
      logger.warn("ReviewService: FAILED due to quality check failure");
      return { status: "FAILED", reasons };
    }

    if (!resolvedFields) {
      reasons.push({ code: "ALL_CRITICAL_FIELDS_EMPTY", message: "No resolved fields available" });
      logger.warn("ReviewService: FAILED — no resolved fields");
      return { status: "FAILED", reasons };
    }

    const emptyCritical = countEmptyCritical(resolvedFields);

    if (emptyCritical === CRITICAL_FIELDS.length) {
      reasons.push({ code: "ALL_CRITICAL_FIELDS_EMPTY", message: "All critical fields are empty" });
      logger.warn("ReviewService: FAILED — all critical fields empty");
      return { status: "FAILED", reasons };
    }

    const validationErrors = hasErrorValidation(fieldValidationResults);
    const needReviewField = hasNeedsReviewField(resolvedFields);
    const unresolvedField = hasUnresolvedField(resolvedFields);
    const hasVisualConflict = hasWarning(ocrWarnings, "VISUAL_MRZ_CONFLICT");
    const hasCriticalWarnings = hasWarning(ocrWarnings, "HUMAN_REVIEW_REQUIRED");

    if (qualityStatus === "NEED_REVIEW") {
      reasons.push({ code: "QUALITY_NEEDS_REVIEW", message: "Image quality requires review" });
    }

    if (!mrzDetected) {
      reasons.push({ code: "MRZ_NOT_FOUND", message: "MRZ zone could not be detected or parsed" });
    }

    if (!documentDetected) {
      reasons.push({ code: "DOCUMENT_NOT_DETECTED", message: "Document boundary not detected" });
    }

    if (emptyCritical > 0) {
      reasons.push({
        code: "SOME_CRITICAL_FIELDS_EMPTY",
        message: `${emptyCritical} critical field(s) are empty`,
      });
    }

    if (validationErrors) {
      reasons.push({ code: "VALIDATION_ERRORS", message: "One or more fields failed validation" });
    }

    if (needReviewField) {
      reasons.push(needReviewField);
    }

    if (unresolvedField) {
      reasons.push(unresolvedField);
    }

    if (hasVisualConflict) {
      reasons.push({ code: "VISUAL_MRZ_CONFLICT", message: "Visual OCR data conflicts with MRZ data" });
    }

    if (overallLevel === "LOW") {
      reasons.push({ code: "OVERALL_CONFIDENCE_LOW", message: "Overall confidence is LOW" });
    }

    if (hasCriticalWarnings) {
      reasons.push({ code: "CRITICAL_WARNINGS", message: "Critical warnings present requiring human review" });
    }

    const needsReview =
      emptyCritical > 0 ||
      validationErrors ||
      needReviewField !== null ||
      unresolvedField !== null ||
      hasVisualConflict ||
      qualityStatus === "NEED_REVIEW" ||
      overallLevel === "LOW" ||
      !mrzDetected ||
      !documentDetected ||
      hasCriticalWarnings;

    if (needsReview) {
      logger.info("ReviewService: status NEED_REVIEW", {
        reasons: reasons.map((r) => r.code),
        overallConfidence,
        overallLevel,
      });
      return { status: "NEED_REVIEW", reasons };
    }

    logger.info("ReviewService: status AUTO_FILLED", {
      overallConfidence,
      overallLevel,
    });
    return { status: "AUTO_FILLED", reasons };
  }
}
