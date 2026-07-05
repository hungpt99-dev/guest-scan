import type { OcrResult, GuestRow, GuestStatus, OcrWarningCode, Gender, DocumentType } from "@guestfill/shared";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";
import { buildFieldConfidence } from "./normalization";
import { logger } from "../../lib/logger";

export function mapGender(ocrGender?: Gender): Gender {
  if (ocrGender && ocrGender !== "UNKNOWN") return ocrGender;
  return "UNKNOWN";
}

export function mapDocumentType(ocrDocType?: DocumentType): DocumentType {
  if (ocrDocType && ocrDocType !== "UNKNOWN") return ocrDocType;
  return "UNKNOWN";
}

export function serializeWarnings(warnings: OcrWarningCode[]): string | undefined {
  if (warnings.length === 0) return undefined;
  return warnings.join("; ");
}

export function getGuestStatus(ocrResult: OcrResult, hasMappedFields: boolean): GuestStatus {
  if (!hasMappedFields) return "FAILED";
  if (ocrResult.warnings.includes("DOCUMENT_EXPIRED")) return "NEED_REVIEW";
  if (ocrResult.warnings.includes("MISSING_REQUIRED_FIELD")) return "MISSING_DATA";
  if (ocrResult.overallConfidenceLevel === "LOW") return "NEED_REVIEW";
  return "READY";
}

export function mapOcrResultToGuestRow(result: OcrResult): Partial<GuestRow> {
  const { fields, overallConfidence, overallConfidenceLevel, warnings, detectedDocumentType, detectedGender } = result;

  const hasContent = Object.values(fields).some((f) => f?.value);
  const status: GuestStatus = getGuestStatus(result, hasContent);

  const documentType = mapDocumentType(detectedDocumentType);

  const mapped: Partial<GuestRow> = {
    fullName: fields.fullName?.value ?? "",
    surname: fields.lastName?.value,
    givenName: fields.firstName?.value,
    passportNumber: fields.passportNumber?.value,
    idNumber: fields.idNumber?.value,
    nationality: fields.nationality?.value,
    dateOfBirth: fields.dateOfBirth?.value,
    gender: mapGender(detectedGender),
    issuingCountry: fields.issuingCountry?.value,
    documentType,
    status,
    confidenceScore: overallConfidence,
    confidenceLevel: overallConfidenceLevel,
    fieldConfidence: buildFieldConfidence(fields),
    ocrWarning: serializeWarnings(warnings),
  };

  const expiryDateStr = fields.expiryDate?.value;
  if (documentType === "PASSPORT") {
    mapped.passportExpiryDate = expiryDateStr;
  } else if (documentType === "ID_CARD") {
    mapped.idExpiryDate = expiryDateStr;
  } else if (expiryDateStr) {
    mapped.passportExpiryDate = expiryDateStr;
  }

  return mapped;
}

export function logOcrCompletion(result: OcrResult, guest: Partial<GuestRow>): void {
  logger.info("OcrController: OCR completed", {
    provider: result.provider,
    overallConfidence: result.overallConfidence,
    confidenceLevel: result.overallConfidenceLevel,
    fieldCount: Object.keys(result.fields).length,
    warnings: result.warnings,
    maskedName: guest.fullName ? maskFullName(guest.fullName) : undefined,
    maskedPassport: guest.passportNumber ? maskPassportNumber(guest.passportNumber) : undefined,
    processingTimeMs: result.processingTimeMs,
  });
}
