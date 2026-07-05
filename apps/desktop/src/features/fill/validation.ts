import { GUEST_FIELD_RULES, validateField, validateForm } from "../../validation/schemas";

export type GuestFormErrors = Record<string, string[]>;
export type GuestFormValidationResult = {
  valid: boolean;
  errors: GuestFormErrors;
};

export function validateGuestField(field: string, value: string, allValues?: Record<string, string>): string[] {
  return validateField(field, value, GUEST_FIELD_RULES, allValues);
}

export function validateGuestForm(values: Record<string, string>): GuestFormValidationResult {
  const result = validateForm(values, GUEST_FIELD_RULES);
  return {
    valid: result.valid,
    errors: result.errors,
  };
}

export function validateGuestFieldValue(field: string, value: string): string | undefined {
  const errors = validateGuestField(field, value);
  return errors.length > 0 ? errors[0] : undefined;
}

export function hasFieldError(errors: GuestFormErrors, field: string): boolean {
  return !!errors[field] && errors[field].length > 0;
}

export function getFieldErrors(errors: GuestFormErrors, field: string): string[] {
  return errors[field] ?? [];
}

export function getFormErrorSummary(errors: GuestFormErrors): string {
  const allErrors = Object.entries(errors);
  if (allErrors.length === 0) return "";
  const totalErrors = allErrors.reduce((sum, [, errs]) => sum + errs.length, 0);
  return `${totalErrors} error${totalErrors === 1 ? "" : "s"} in ${allErrors.length} field${allErrors.length === 1 ? "" : "s"}`;
}
