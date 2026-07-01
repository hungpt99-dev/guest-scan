import type { MrzParseResult } from "./mrz_parser_service";
import type { VisualOcrResult } from "./visual_ocr_service";
import type { FieldValidationResult } from "./field_validator";
import type { OcrWarning } from "./image_quality_service";
import { logger } from "../lib/logger";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";

export type FieldSource = "mrz" | "mrz_repaired" | "visual_ocr" | "manual_correction" | "unresolved";

export type ResolvedField = {
  value: string;
  source: FieldSource;
  confidence: number;
  originalValue?: string;
  repairedFrom?: string;
  needsReview: boolean;
  validationResult?: FieldValidationResult;
};

export type ResolvedFields = {
  fullName: ResolvedField;
  surname: ResolvedField;
  givenName: ResolvedField;
  gender: ResolvedField;
  dateOfBirth: ResolvedField;
  nationality: ResolvedField;
  issuingCountry: ResolvedField;
  documentType: ResolvedField;
  passportNumber: ResolvedField;
  idNumber: ResolvedField;
  expiryDate: ResolvedField;
  issueDate: ResolvedField;
};

export type OverallConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type FieldResolverResult = {
  resolvedFields: ResolvedFields;
  overallConfidence: number;
  overallLevel: OverallConfidenceLevel;
  status: "AUTO_FILLED" | "NEED_REVIEW" | "FAILED";
  ocrWarnings: OcrWarning[];
};

export interface FieldResolverService {
  resolveFields(params: {
    mrzParseResult: MrzParseResult;
    visualOcrResult?: VisualOcrResult;
    validationResults: FieldValidationResult[];
  }): FieldResolverResult;
}

const IMPORTANT_FIELDS = [
  "passportNumber",
  "fullName",
  "dateOfBirth",
  "gender",
  "nationality",
  "expiryDate",
  "issuingCountry",
] as const;

export function createFieldResolverService(): FieldResolverService {
  return new DefaultFieldResolverService();
}

function mrzFieldToCheckDigitKey(fieldName: string): string {
  const map: Record<string, string> = {
    passportNumber: "passport_number_valid",
    dateOfBirth: "date_of_birth_valid",
    expiryDate: "expiry_date_valid",
    idNumber: "optional_data_valid",
  };
  return map[fieldName] || "";
}

function checkDigitsAllPass(checkDigits: Record<string, boolean>): boolean {
  const relevant = [
    "passport_number_valid",
    "date_of_birth_valid",
    "expiry_date_valid",
    "optional_data_valid",
    "final_composite_valid",
  ];
  const present = relevant.filter((k) => k in checkDigits);
  if (present.length === 0) return false;
  return present.every((k) => checkDigits[k] === true);
}

function checkDigitsPassportPass(checkDigits: Record<string, boolean>): boolean {
  return checkDigits["passport_number_valid"] === true;
}

function calculateFieldConfidence(
  source: FieldSource,
  mrzCheckDigits: Record<string, boolean>,
  visualConfidence: number,
): number {
  switch (source) {
    case "mrz": {
      const allPass = checkDigitsAllPass(mrzCheckDigits);
      const passportPass = checkDigitsPassportPass(mrzCheckDigits);
      if (allPass) return 0.98;
      if (passportPass) return 0.92;
      return 0.85;
    }
    case "mrz_repaired": {
      const passportPass = checkDigitsPassportPass(mrzCheckDigits);
      if (passportPass) return 0.88;
      return 0.82;
    }
    case "visual_ocr":
      if (visualConfidence >= 0.9) return 0.72;
      if (visualConfidence >= 0.7) return 0.65;
      return Math.max(0.5, visualConfidence);
    case "manual_correction":
      return 1.0;
    case "unresolved":
    default:
      return 0;
  }
}

function sourceFromFieldConflict(
  fieldName: string,
  visualResult?: VisualOcrResult,
): { value: string; source: FieldSource } | null {
  if (!visualResult) return null;
  const conflict = visualResult.fieldConflicts.find((c) => c.fieldName === fieldName);
  if (!conflict) return null;
  const sourceMap: Record<string, FieldSource> = {
    mrz: "mrz",
    mrz_repaired: "mrz_repaired",
    visual_ocr: "visual_ocr",
    merged: "mrz",
  };
  return {
    value: conflict.resolvedValue,
    source: sourceMap[conflict.resolvedFrom] ?? "visual_ocr",
  };
}

function findValidationResult(fieldName: string, results: FieldValidationResult[]): FieldValidationResult | undefined {
  return results.find((r) => r.fieldName === fieldName);
}

function resolveField(
  fieldName: string,
  mrzValue: string,
  mrzCheckDigits: Record<string, boolean>,
  visualResult: VisualOcrResult | undefined,
  validationResults: FieldValidationResult[],
): ResolvedField {
  const visualInfo = sourceFromFieldConflict(fieldName, visualResult);
  const validation = findValidationResult(fieldName, validationResults);
  const mrzHasValue = mrzValue.length > 0;
  const mrzCheckDigitPass = mrzFieldToCheckDigitKey(fieldName)
    ? mrzCheckDigits[mrzFieldToCheckDigitKey(fieldName)] === true
    : false;

  let value = "";
  let source: FieldSource = "unresolved";
  let originalValue: string | undefined;
  let repairedFrom: string | undefined;
  let needsReview = true;
  let confidence = 0;

  if (mrzHasValue) {
    value = mrzValue;
    source = mrzCheckDigitPass ? "mrz" : "mrz";
    originalValue = undefined;
    repairedFrom = undefined;
  }

  if (visualInfo && visualInfo.value) {
    if (visualInfo.source === "mrz" || visualInfo.source === "mrz_repaired") {
      if (!mrzHasValue) {
        value = visualInfo.value;
        source = visualInfo.source;
      }
    } else if (visualInfo.source === "visual_ocr") {
      if (!mrzHasValue || (!mrzCheckDigitPass && source === "mrz")) {
        value = visualInfo.value;
        source = "visual_ocr";
      }
    }
  }

  if (validation) {
    value = validation.value;
    if (validation.corrected) {
      source = "mrz_repaired";
      repairedFrom = validation.repairedFrom;
    }
    if (validation.corrected && validation.repairedFrom) {
      originalValue = validation.rawValue;
    }
  }

  const visualConf = visualResult?.visualConfidence ?? 0;
  confidence = calculateFieldConfidence(source, mrzCheckDigits, visualConf);

  const hasValue = value.length > 0;
  const validationPassed = validation?.valid ?? false;
  const hasErrors = validation?.issues.some((i) => i.severity === "error") ?? false;
  needsReview = !hasValue || hasErrors || (!validationPassed && source === "visual_ocr");

  if (source === "mrz" && mrzCheckDigitPass && hasValue && !hasErrors) {
    needsReview = false;
  }

  return {
    value,
    source,
    confidence,
    originalValue,
    repairedFrom,
    needsReview,
    validationResult: validation,
  };
}

function calculateOverallConfidence(resolved: ResolvedFields): {
  overallConfidence: number;
  overallLevel: OverallConfidenceLevel;
} {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const name of IMPORTANT_FIELDS) {
    const field = resolved[name];
    if (!field || !field.value) continue;
    const weight = name === "passportNumber" || name === "fullName" ? 1.5 : 1.0;
    const penalty = field.source === "visual_ocr" ? 0.8 : field.source === "mrz_repaired" ? 0.9 : 1.0;
    totalWeight += weight;
    weightedSum += field.confidence * penalty * weight;
  }
  const overallConfidence = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

  let overallLevel: OverallConfidenceLevel;
  if (overallConfidence >= 0.85) {
    overallLevel = "HIGH";
  } else if (overallConfidence >= 0.5) {
    overallLevel = "MEDIUM";
  } else {
    overallLevel = "LOW";
  }

  return { overallConfidence, overallLevel };
}

function determineStatus(
  resolved: ResolvedFields,
  overallLevel: OverallConfidenceLevel,
): "AUTO_FILLED" | "NEED_REVIEW" | "FAILED" {
  const criticalFields = [resolved.passportNumber, resolved.fullName, resolved.dateOfBirth, resolved.expiryDate];

  const emptyCritical = criticalFields.filter((f) => !f.value).length;

  if (emptyCritical === criticalFields.length) {
    return "FAILED";
  }

  const anyNeedsReview = Object.values(resolved).some(
    (f) => f.needsReview && f.source !== "unresolved" && f.value.length > 0,
  );

  const anyUnresolved = Object.values(resolved).some((f) => f.source === "unresolved");

  const anyConflicting = Object.values(resolved).some((f) => f.source === "visual_ocr" && f.value.length > 0);

  if (emptyCritical > 0) {
    return "NEED_REVIEW";
  }

  if (overallLevel === "LOW") {
    return "NEED_REVIEW";
  }

  if (anyNeedsReview || anyUnresolved || anyConflicting) {
    return "NEED_REVIEW";
  }

  if (overallLevel === "HIGH") {
    return "AUTO_FILLED";
  }

  return "NEED_REVIEW";
}

function generateWarnings(
  resolved: ResolvedFields,
  mrzCheckDigits: Record<string, boolean>,
  visualOcrResult?: VisualOcrResult,
): OcrWarning[] {
  const warnings: OcrWarning[] = [];

  if (resolved.passportNumber.source === "mrz_repaired") {
    warnings.push("MRZ_REPAIRED");
    warnings.push("PASSPORT_NUMBER_REPAIRED");
  }

  if (resolved.dateOfBirth.source === "mrz_repaired") {
    if (!warnings.includes("MRZ_REPAIRED")) warnings.push("MRZ_REPAIRED");
    if (!warnings.includes("DOB_REPAIRED")) warnings.push("DOB_REPAIRED");
  }

  if (resolved.expiryDate.source === "mrz_repaired") {
    if (!warnings.includes("MRZ_REPAIRED")) warnings.push("MRZ_REPAIRED");
    if (!warnings.includes("EXPIRY_REPAIRED")) warnings.push("EXPIRY_REPAIRED");
  }

  if (resolved.issuingCountry.source === "mrz_repaired" || resolved.nationality.source === "mrz_repaired") {
    if (!warnings.includes("COUNTRY_CODE_REPAIRED")) warnings.push("COUNTRY_CODE_REPAIRED");
  }

  const checkDigitKeys = ["passport_number_valid", "date_of_birth_valid", "expiry_date_valid", "final_composite_valid"];
  const anyCheckDigitFailed = checkDigitKeys.some((k) => k in mrzCheckDigits && mrzCheckDigits[k] !== true);
  if (anyCheckDigitFailed && !warnings.includes("MRZ_CHECK_DIGIT_FAILED")) {
    warnings.push("MRZ_CHECK_DIGIT_FAILED");
  }

  const visualFields = Object.values(resolved).filter((f) => f.source === "visual_ocr" && f.value.length > 0);
  if (visualFields.length > 0 && !warnings.includes("VISUAL_MRZ_CONFLICT")) {
    warnings.push("VISUAL_MRZ_CONFLICT");
  }

  if (visualOcrResult) {
    for (const w of visualOcrResult.warnings) {
      if (!warnings.includes(w as OcrWarning)) {
        warnings.push(w as OcrWarning);
      }
    }
  }

  const lowConfidenceFields = Object.values(resolved).filter((f) => f.confidence < 0.7 && f.value.length > 0);
  if (lowConfidenceFields.length > 0 && !warnings.includes("LOW_CONFIDENCE_FIELD")) {
    warnings.push("LOW_CONFIDENCE_FIELD");
  }

  const needsHumanReview = Object.values(resolved).some(
    (f) => f.needsReview && f.value.length > 0 && f.source !== "mrz",
  );
  if (needsHumanReview && !warnings.includes("HUMAN_REVIEW_REQUIRED")) {
    warnings.push("HUMAN_REVIEW_REQUIRED");
  }

  return warnings;
}

function maskField(fieldName: string, value: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes("passport") || lower.includes("number") || lower === "idnumber") {
    return maskPassportNumber(value);
  }
  if (lower === "fullname" || lower === "surname" || lower === "givenname") {
    return maskFullName(value);
  }
  return value;
}

class DefaultFieldResolverService implements FieldResolverService {
  resolveFields(params: {
    mrzParseResult: MrzParseResult;
    visualOcrResult?: VisualOcrResult;
    validationResults: FieldValidationResult[];
  }): FieldResolverResult {
    const { mrzParseResult, visualOcrResult, validationResults } = params;
    const mrzCheckDigits = mrzParseResult.checkDigits;

    const resolved: ResolvedFields = {
      surname: resolveField("surname", mrzParseResult.surname, mrzCheckDigits, visualOcrResult, validationResults),
      givenName: resolveField(
        "givenName",
        mrzParseResult.givenName,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      fullName: resolveField("fullName", mrzParseResult.fullName, mrzCheckDigits, visualOcrResult, validationResults),
      gender: resolveField("gender", mrzParseResult.gender, mrzCheckDigits, visualOcrResult, validationResults),
      dateOfBirth: resolveField(
        "dateOfBirth",
        mrzParseResult.dateOfBirth,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      nationality: resolveField(
        "nationality",
        mrzParseResult.nationality,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      issuingCountry: resolveField(
        "issuingCountry",
        mrzParseResult.issuingCountry,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      documentType: resolveField(
        "documentType",
        mrzParseResult.documentType,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      passportNumber: resolveField(
        "passportNumber",
        mrzParseResult.passportNumber,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      idNumber: resolveField(
        "idNumber",
        mrzParseResult.optionalData,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      expiryDate: resolveField(
        "expiryDate",
        mrzParseResult.expiryDate,
        mrzCheckDigits,
        visualOcrResult,
        validationResults,
      ),
      issueDate: {
        value: "",
        source: "unresolved" as FieldSource,
        confidence: 0,
        needsReview: false,
      },
    };

    const { overallConfidence, overallLevel } = calculateOverallConfidence(resolved);
    const status = determineStatus(resolved, overallLevel);
    const ocrWarnings = generateWarnings(resolved, mrzCheckDigits, visualOcrResult);

    logger.info("FieldResolver: resolution complete", {
      status,
      overallConfidence,
      overallLevel,
      warningCount: ocrWarnings.length,
      maskedPassport: maskField("passportNumber", resolved.passportNumber.value),
      maskedName: maskField("fullName", resolved.fullName.value),
      passportSource: resolved.passportNumber.source,
    });

    return {
      resolvedFields: resolved,
      overallConfidence,
      overallLevel,
      status,
      ocrWarnings,
    };
  }
}
