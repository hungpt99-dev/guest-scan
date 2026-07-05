import type { ExtractedFields, OcrWarningCode } from "@guestfill/shared";
import { checkDateExpired, checkDateExpiringSoon } from "./normalization";

const LOW_CONFIDENCE_WARNING_THRESHOLD = 0.4;

export type WarningOptions = {
  lowConfidenceThreshold?: number;
  requiredFields?: (keyof ExtractedFields)[];
};

const DEFAULT_REQUIRED_FIELDS: (keyof ExtractedFields)[] = ["fullName", "dateOfBirth", "nationality", "documentType"];

export function detectWarnings(
  fields: ExtractedFields,
  overallConfidence: number,
  options?: WarningOptions,
): OcrWarningCode[] {
  const warnings: OcrWarningCode[] = [];
  const threshold = options?.lowConfidenceThreshold ?? LOW_CONFIDENCE_WARNING_THRESHOLD;

  if (overallConfidence < threshold) {
    warnings.push("LOW_CONFIDENCE_FIELD");
  }

  if (fields.expiryDate?.value) {
    const expired = checkDateExpired(fields.expiryDate.value);
    if (expired === true) {
      warnings.push("DOCUMENT_EXPIRED");
    } else if (expired === false && checkDateExpiringSoon(fields.expiryDate.value)) {
      warnings.push("DOCUMENT_EXPIRING_SOON");
    }
  }

  const requiredFields = options?.requiredFields ?? DEFAULT_REQUIRED_FIELDS;
  for (const field of requiredFields) {
    if (!fields[field]?.value) {
      if (!warnings.includes("MISSING_REQUIRED_FIELD")) {
        warnings.push("MISSING_REQUIRED_FIELD");
      }
      break;
    }
  }

  for (const [, field] of Object.entries(fields)) {
    if (field && field.confidence < threshold && !warnings.includes("LOW_CONFIDENCE_FIELD")) {
      warnings.push("LOW_CONFIDENCE_FIELD");
      break;
    }
  }

  return warnings;
}
