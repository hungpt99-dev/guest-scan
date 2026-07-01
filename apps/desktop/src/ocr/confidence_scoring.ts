import type { FieldValidationResult } from "./field_validator";

export function needsReview(validationResults: FieldValidationResult[]): boolean {
  return validationResults.some((r) => r.needsReview);
}

export function fieldsRequiringReview(validationResults: FieldValidationResult[]): FieldValidationResult[] {
  return validationResults.filter((r) => r.needsReview);
}

export function getOverallConfidence(validationResults: FieldValidationResult[]): number {
  if (validationResults.length === 0) return 0;
  const sum = validationResults.reduce((acc, r) => acc + r.adjustedConfidence, 0);
  return sum / validationResults.length;
}

export function isReadyForAutofill(
  validationResults: FieldValidationResult[],
  requiredFields: string[] = ["fullName", "passportNumber", "dateOfBirth", "expiryDate", "nationality", "gender"],
): boolean {
  const required = validationResults.filter((r) => requiredFields.includes(r.fieldName));
  if (required.length < requiredFields.length) return false;
  return required.every((r) => r.valid && !r.needsReview);
}
