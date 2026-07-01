import type { NormalizedFields } from "../services/field_normalization_service";
import type { FieldConfidenceScores } from "../services/ocr_confidence_service";
import type { ConfidenceLevel } from "@guestfill/shared";

export type AutofillFieldKey =
  | "fullName"
  | "gender"
  | "dateOfBirth"
  | "nationality"
  | "passportNumber"
  | "expiryDate"
  | "issuingCountry";

export type FieldMetaEntry = {
  label: string;
  type: string;
  placeholder: string;
};

export const AUTOFILL_FIELD_META: Record<AutofillFieldKey, FieldMetaEntry> = {
  fullName: { label: "Full Name", type: "text", placeholder: "e.g. SMITH JOHN" },
  gender: { label: "Gender", type: "text", placeholder: "M / F / UNKNOWN" },
  dateOfBirth: { label: "Date of Birth", type: "text", placeholder: "YYYY-MM-DD" },
  nationality: { label: "Nationality", type: "text", placeholder: "e.g. GBR" },
  passportNumber: { label: "Passport Number", type: "text", placeholder: "e.g. AB1234567" },
  expiryDate: { label: "Expiry Date", type: "text", placeholder: "YYYY-MM-DD" },
  issuingCountry: { label: "Issuing Country", type: "text", placeholder: "e.g. GBR" },
};

export function confidenceBorder(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "border-green-300 bg-green-50";
    case "MEDIUM":
      return "border-yellow-300 bg-yellow-50";
    case "LOW":
      return "border-red-300 bg-red-50";
  }
}

export function confidenceBadge(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "bg-green-100 text-green-800";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800";
    case "LOW":
      return "bg-red-100 text-red-800";
  }
}

export function severityBorder(severity: "error" | "warning"): string {
  return severity === "error" ? "border-red-300 bg-red-50" : "border-yellow-300 bg-yellow-50";
}

export function severityBadge(severity: "error" | "warning"): string {
  return severity === "error" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800";
}

export function getFieldConfidence(field: AutofillFieldKey, confidence: FieldConfidenceScores) {
  return confidence[field as keyof FieldConfidenceScores];
}

export function getFieldValue(field: AutofillFieldKey, fields: NormalizedFields): string {
  return (fields[field as keyof NormalizedFields] as string) || "";
}

export function mergeFieldsWithEdits(
  fields: NormalizedFields,
  edits: Partial<Record<AutofillFieldKey, string>>,
): NormalizedFields {
  if (Object.keys(edits).length === 0) return fields;
  return {
    ...fields,
    ...Object.fromEntries(Object.entries(edits).map(([key, value]) => [key, value ?? ""])),
  };
}

export function countFieldsNeedingReview(
  fieldKeys: AutofillFieldKey[],
  needsReviewMap: Record<string, boolean>,
  lowConfidenceFields: string[],
): number {
  let count = 0;
  for (const key of fieldKeys) {
    if (needsReviewMap[key] || lowConfidenceFields.includes(key)) {
      count++;
    }
  }
  return count;
}
