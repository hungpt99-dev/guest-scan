import type { GuestRow, TargetSystemTemplate } from "@guestfill/shared";

export type SafetyCheckResult = {
  passed: boolean;
  checks: SafetyCheck[];
};

export type SafetyCheck = {
  name: string;
  passed: boolean;
  message?: string;
};

export function checkGuestRow(guest: GuestRow, requireConfirmation?: boolean): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const rowExists = !!guest.id || false;
  checks.push({ name: "guest_row_exists", passed: rowExists, message: rowExists ? undefined : "Guest row not found" });

  const notFailed = !!(guest.status !== "FAILED" || requireConfirmation);
  checks.push({
    name: "guest_not_failed",
    passed: notFailed,
    message: notFailed ? undefined : "Guest row has FAILED status",
  });

  const hasRequiredFields = checkRequiredFields(guest);
  checks.push({
    name: "required_fields_exist",
    passed: hasRequiredFields,
    message: hasRequiredFields ? undefined : "Required fields are missing",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkTemplateMatch(
  template: TargetSystemTemplate,
  currentUrl?: string,
  currentWindowTitle?: string,
): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const templateExists = !!template.id;
  checks.push({
    name: "template_exists",
    passed: templateExists,
    message: templateExists ? undefined : "Target template not found",
  });

  if (template.urlPattern && currentUrl) {
    const patternMatch = matchPattern(template.urlPattern, currentUrl);
    checks.push({
      name: "url_matches",
      passed: patternMatch,
      message: patternMatch ? undefined : `URL does not match pattern: ${template.urlPattern}`,
    });
  } else if (template.urlPattern) {
    checks.push({ name: "url_matches", passed: false, message: "Current URL not available for matching" });
  } else {
    checks.push({ name: "url_matches", passed: true });
  }

  if (template.windowTitlePattern && currentWindowTitle) {
    const titleMatch = currentWindowTitle.includes(template.windowTitlePattern.replace("*", ""));
    checks.push({
      name: "window_title_matches",
      passed: titleMatch,
      message: titleMatch ? undefined : `Window title does not match: ${template.windowTitlePattern}`,
    });
  } else if (template.windowTitlePattern) {
    checks.push({ name: "window_title_matches", passed: false, message: "Window title not available for matching" });
  } else {
    checks.push({ name: "window_title_matches", passed: true });
  }

  const hasFields = template.mappings.some((m) => m.enabled);
  checks.push({
    name: "has_mapped_fields",
    passed: hasFields,
    message: hasFields ? undefined : "No mapped fields in template",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkAutoSaveSafety(template: TargetSystemTemplate, guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const saveModeIsAuto = template.saveMode === "auto";
  checks.push({
    name: "auto_save_enabled",
    passed: saveModeIsAuto,
    message: saveModeIsAuto ? undefined : "Auto Save is not enabled for this template",
  });

  const hasAutoSaveSelector = !!template.autoSaveSelector || !!template.autoSaveControlId;
  checks.push({
    name: "auto_save_configured",
    passed: hasAutoSaveSelector,
    message: hasAutoSaveSelector ? undefined : "Auto Save selector is not configured",
  });

  const allRequiredMapped = template.mappings
    .filter((m) => m.enabled && m.required)
    .every((m) => {
      const val = (guest as Record<string, unknown>)[m.excelColumn];
      return val !== undefined && val !== null && val !== "";
    });
  checks.push({
    name: "required_values_exist",
    passed: allRequiredMapped,
    message: allRequiredMapped ? undefined : "Required guest values are missing",
  });

  const guestNotFailed = guest.status !== "FAILED";
  checks.push({
    name: "guest_not_failed",
    passed: guestNotFailed,
    message: guestNotFailed ? undefined : "Guest has FAILED status",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkMappedValuesExist(guest: GuestRow, template: TargetSystemTemplate): SafetyCheckResult {
  const checks: SafetyCheck[] = [];
  for (const mapping of template.mappings.filter((m) => m.enabled)) {
    const value = (guest as Record<string, unknown>)[mapping.excelColumn];
    const exists = value !== undefined && value !== null && value !== "";
    checks.push({
      name: `field_${mapping.excelColumn}`,
      passed: exists,
      message: exists ? undefined : `Required value missing: ${mapping.targetFieldName}`,
    });
  }
  return { passed: checks.every((c) => c.passed), checks };
}

function checkRequiredFields(guest: GuestRow): boolean {
  if (!guest.fullName) return false;
  if (guest.documentType === "PASSPORT" && !guest.passportNumber) return false;
  if (guest.documentType === "ID_CARD" && !guest.idNumber) return false;
  return true;
}

function matchPattern(pattern: string, url: string): boolean {
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/[.+?^${}()|[\]\\]/g, "\\$&") + "$");
    return regex.test(url);
  }
  return url.includes(pattern);
}
