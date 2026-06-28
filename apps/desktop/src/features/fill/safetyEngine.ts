import type { GuestRow, TargetSystemTemplate, ConfidenceLevel } from "@guestfill/shared";

export type SafetyCheckResult = {
  passed: boolean;
  checks: SafetyCheck[];
};

export type SafetyCheck = {
  name: string;
  passed: boolean;
  message?: string;
};

export type AccuracyInfo = {
  field: string;
  level: ConfidenceLevel;
  score: number;
  issues: string[];
};

export function checkGuestRow(guest: GuestRow, requireConfirmation?: boolean): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const rowExists = !!guest.id;
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

export function checkConfidence(guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const score = guest.confidenceScore ?? 0;
  const level = guest.confidenceLevel ?? "LOW";

  const highConfidence = score >= 0.9;
  checks.push({
    name: "high_confidence",
    passed: highConfidence,
    message: highConfidence
      ? undefined
      : `Low confidence score: ${level} (${(score * 100).toFixed(0)}%) — review guest data before filling`,
  });

  const mediumConfidence = score >= 0.7;
  checks.push({
    name: "medium_confidence",
    passed: mediumConfidence,
    message: mediumConfidence
      ? undefined
      : `Very low confidence score: ${level} (${(score * 100).toFixed(0)}%) — data may be inaccurate`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkFieldAccuracy(guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  if (guest.fullName) {
    if (guest.fullName.length < 2) {
      checks.push({ name: "field_fullName_length", passed: false, message: "Full name is too short" });
    }
    if (/^\d+$/.test(guest.fullName)) {
      checks.push({ name: "field_fullName_digits", passed: false, message: "Full name contains only digits" });
    }
  }

  if (guest.passportNumber) {
    const validPassport = /^[A-Za-z0-9]{5,20}$/.test(guest.passportNumber);
    checks.push({
      name: "field_passportNumber_format",
      passed: validPassport,
      message: validPassport ? undefined : "Passport number format is invalid",
    });
    if (/^0+$/.test(guest.passportNumber)) {
      checks.push({
        name: "field_passportNumber_zeros",
        passed: false,
        message: "Passport number appears to be default/zero-filled",
      });
    }
  }

  if (guest.idNumber) {
    const validId = /^[A-Za-z0-9]{5,30}$/.test(guest.idNumber);
    checks.push({
      name: "field_idNumber_format",
      passed: validId,
      message: validId ? undefined : "ID number format is invalid",
    });
  }

  if (guest.dateOfBirth) {
    const parsed = new Date(guest.dateOfBirth);
    const validDate = !isNaN(parsed.getTime());
    checks.push({
      name: "field_dateOfBirth_parse",
      passed: validDate,
      message: validDate ? undefined : "Date of birth is not a valid date",
    });
    if (validDate) {
      const now = new Date();
      const age = now.getFullYear() - parsed.getFullYear();
      const reasonable = age > 0 && age < 120;
      checks.push({
        name: "field_dateOfBirth_range",
        passed: reasonable,
        message: reasonable ? undefined : "Date of birth is outside reasonable range (0–120 years)",
      });
      if (parsed > now) {
        checks.push({ name: "field_dateOfBirth_future", passed: false, message: "Date of birth is in the future" });
      }
    }
  }

  if (guest.passportExpiryDate) {
    const parsed = new Date(guest.passportExpiryDate);
    if (!isNaN(parsed.getTime()) && parsed < new Date()) {
      checks.push({ name: "field_passportExpiryDate_expired", passed: false, message: "Passport has expired" });
    }
  }

  if (guest.idExpiryDate) {
    const parsed = new Date(guest.idExpiryDate);
    if (!isNaN(parsed.getTime()) && parsed < new Date()) {
      checks.push({ name: "field_idExpiryDate_expired", passed: false, message: "ID has expired" });
    }
  }

  if (guest.gender && guest.gender !== "UNKNOWN") {
    const validGender = guest.gender === "M" || guest.gender === "F";
    checks.push({
      name: "field_gender_value",
      passed: validGender,
      message: validGender ? undefined : `Unusual gender value: ${guest.gender}`,
    });
  }

  if (guest.nationality && guest.issuingCountry && guest.nationality !== guest.issuingCountry) {
    const map: Record<string, string> = {
      VN: "VNM",
      US: "USA",
      KR: "KOR",
      CN: "CHN",
      JP: "JPN",
      FR: "FRA",
      DE: "DEU",
      GB: "GBR",
    };
    const normNationality = map[guest.nationality] ?? guest.nationality;
    const normIssuing = map[guest.issuingCountry] ?? guest.issuingCountry;
    if (normNationality !== normIssuing) {
      checks.push({
        name: "field_nationality_consistency",
        passed: false,
        message: `Nationality (${guest.nationality}) differs from issuing country (${guest.issuingCountry})`,
      });
    }
  }

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

export function getFieldAccuracyInfo(guest: GuestRow): AccuracyInfo[] {
  const accuracies: AccuracyInfo[] = [];

  if (guest.fullName) {
    accuracies.push(getNameAccuracy(guest.fullName));
  }
  if (guest.passportNumber) {
    accuracies.push(getPassportAccuracy(guest.passportNumber));
  }
  if (guest.idNumber) {
    accuracies.push(getIdAccuracy(guest.idNumber));
  }
  if (guest.dateOfBirth) {
    accuracies.push(getDateAccuracy("dateOfBirth", guest.dateOfBirth));
  }
  if (guest.passportExpiryDate) {
    accuracies.push(getDateAccuracy("passportExpiryDate", guest.passportExpiryDate));
  }
  if (guest.gender) {
    accuracies.push(getGenderAccuracy(guest.gender));
  }
  if (guest.nationality) {
    accuracies.push(getNationalityAccuracy(guest.nationality));
  }

  return accuracies;
}

function getNameAccuracy(name: string): AccuracyInfo {
  const score = name.length >= 2 && !/^\d+$/.test(name) ? 1.0 : 0.3;
  const issues: string[] = [];
  if (name.length < 2) issues.push("Name too short");
  if (/^\d+$/.test(name)) issues.push("Name contains only digits");
  return {
    field: "fullName",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getPassportAccuracy(passport: string): AccuracyInfo {
  const issues: string[] = [];
  let score = 1.0;
  if (!/^[A-Za-z0-9]{5,20}$/.test(passport)) {
    score = 0.3;
    issues.push("Invalid passport format");
  }
  if (/^0+$/.test(passport)) {
    score = 0.1;
    issues.push("Zero-filled passport number");
  }
  return {
    field: "passportNumber",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getIdAccuracy(id: string): AccuracyInfo {
  const issues: string[] = [];
  let score = 1.0;
  if (!/^[A-Za-z0-9]{5,30}$/.test(id)) {
    score = 0.3;
    issues.push("Invalid ID number format");
  }
  return {
    field: "idNumber",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getDateAccuracy(field: string, date: string): AccuracyInfo {
  const issues: string[] = [];
  const parsed = new Date(date);
  let score = 1.0;
  if (isNaN(parsed.getTime())) {
    score = 0.2;
    issues.push("Invalid date format");
  } else {
    const now = new Date();
    if (field === "passportExpiryDate" || field === "idExpiryDate") {
      if (parsed < now) {
        score = 0.3;
        issues.push("Document has expired");
      }
    }
    if (field === "dateOfBirth") {
      const age = now.getFullYear() - parsed.getFullYear();
      if (age <= 0 || age >= 120) {
        score = 0.2;
        issues.push("Age outside reasonable range");
      }
    }
  }
  return {
    field,
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getGenderAccuracy(gender: string): AccuracyInfo {
  const score = gender === "M" || gender === "F" ? 1.0 : gender === "UNKNOWN" ? 0.0 : 0.5;
  const issues: string[] = [];
  if (score < 1.0) issues.push(`Unusual gender value: ${gender}`);
  return {
    field: "gender",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getNationalityAccuracy(nationality: string): AccuracyInfo {
  const issues: string[] = [];
  const validIso2 = /^[A-Za-z]{2}$/.test(nationality);
  const validIso3 = /^[A-Za-z]{3}$/.test(nationality);
  let score = 1.0;
  if (!validIso2 && !validIso3) {
    score = 0.4;
    issues.push("Unexpected nationality format");
  }
  return {
    field: "nationality",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchPattern(pattern: string, url: string): boolean {
  if (pattern.includes("*")) {
    const parts = pattern.split("*");
    const escaped = parts.map((p) => escapeRegex(p));
    const regexStr = escaped.join(".*");
    const regex = new RegExp(regexStr);
    return regex.test(url);
  }
  return url.includes(pattern);
}
