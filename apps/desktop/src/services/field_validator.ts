import type { OcrWarning } from "./image_quality_service";
import { logger } from "../lib/logger";

export type FieldIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type FieldValidationResult = {
  fieldName: string;
  value: string;
  rawValue: string;
  confidence: number;
  adjustedConfidence: number;
  valid: boolean;
  issues: FieldIssue[];
  needsReview: boolean;
  corrected: boolean;
  repairedFrom?: string;
};

export type FieldValidationOptions = {
  corrected?: boolean;
  mrzValid?: boolean;
  mrzCheckDigitsPassed?: boolean;
  config?: Partial<ValidationConfig>;
};

export type ValidationConfig = {
  minConfidence: number;
  reviewThreshold: number;
  mrzBoostEnabled: boolean;
  mrzBoostAmount: number;
  correctionPenalty: number;
  enableCountryRepair: boolean;
};

export type DocumentFields = {
  surname?: string;
  givenName?: string;
  fullName?: string;
  passportNumber?: string;
  idNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: string;
  expiryDate?: string;
  issuingCountry?: string;
  documentType?: string;
};

export type DocumentFieldsWithRaw = {
  fields: DocumentFields;
  rawFields: DocumentFields;
};

export interface FieldValidatorService {
  validateField(
    fieldName: string,
    value: string,
    rawValue: string,
    confidence: number,
    options?: FieldValidationOptions,
  ): FieldValidationResult;

  validateExtractedFields(fields: DocumentFields, options?: FieldValidationOptions): FieldValidationResult[];

  repairCountryCode(code: string): { repaired: boolean; repairedCode: string | null };

  repairNationality(nationality: string, issuingCountry: string): { repaired: boolean; repairedCode: string };

  isValidCountryCode(code: string): boolean;

  getValidationWarnings(results: FieldValidationResult[]): OcrWarning[];
}

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minConfidence: 0.4,
  reviewThreshold: 0.7,
  mrzBoostEnabled: true,
  mrzBoostAmount: 0.15,
  correctionPenalty: 0.1,
  enableCountryRepair: true,
};

const COUNTRY_REPAIR_MAP: Record<string, string> = {
  VNB: "VNM",
  VNA: "VNM",
  VNAA: "VNM",
  VNMA: "VNM",
  VNN: "VNM",
  VNM: "VNM",
};

const COMMON_OCR_COUNTRY_ERRORS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^VN[A-Z0-9<]$/i, replacement: "VNM" },
  { pattern: /^UT[A-Z0-9<]$/i, replacement: "UTO" },
  { pattern: /^D[A-Z0-9<]{2}$/i, replacement: "DEU" },
  { pattern: /^FR[A-Z0-9<]$/i, replacement: "FRA" },
  { pattern: /^GB[A-Z0-9<]$/i, replacement: "GBR" },
  { pattern: /^US[A-Z0-9<]$/i, replacement: "USA" },
  { pattern: /^CN[A-Z0-9<]$/i, replacement: "CHN" },
  { pattern: /^J[A-Z0-9<]{2}$/i, replacement: "JPN" },
  { pattern: /^K[A-Z0-9<]{2}$/i, replacement: "KOR" },
  { pattern: /^I[A-Z0-9<]{2}$/i, replacement: "IND" },
  { pattern: /^TH[A-Z0-9<]$/i, replacement: "THA" },
  { pattern: /^S[A-Z0-9<]{2}$/i, replacement: "SGP" },
  { pattern: /^M[A-Z0-9<]{2}$/i, replacement: "MYS" },
];

const COUNTRY_CODES = new Set([
  "AFG",
  "ALB",
  "DZA",
  "AND",
  "AGO",
  "ARG",
  "ARM",
  "AUS",
  "AUT",
  "AZE",
  "BHS",
  "BHR",
  "BGD",
  "BRB",
  "BLR",
  "BEL",
  "BLZ",
  "BEN",
  "BTN",
  "BOL",
  "BIH",
  "BWA",
  "BRA",
  "BRN",
  "BGR",
  "BFA",
  "BDI",
  "CPV",
  "KHM",
  "CMR",
  "CAN",
  "CAF",
  "TCD",
  "CHL",
  "CHN",
  "COL",
  "COM",
  "COD",
  "COG",
  "CRI",
  "CIV",
  "HRV",
  "CUB",
  "CYP",
  "CZE",
  "DNK",
  "DJI",
  "DMA",
  "DOM",
  "ECU",
  "EGY",
  "SLV",
  "GNQ",
  "ERI",
  "EST",
  "SWZ",
  "ETH",
  "FJI",
  "FIN",
  "FRA",
  "GAB",
  "GMB",
  "GEO",
  "DEU",
  "GHA",
  "GRC",
  "GRD",
  "GTM",
  "GIN",
  "GNB",
  "GUY",
  "HTI",
  "HND",
  "HUN",
  "ISL",
  "IND",
  "IDN",
  "IRN",
  "IRQ",
  "IRL",
  "ISR",
  "ITA",
  "JAM",
  "JPN",
  "JOR",
  "KAZ",
  "KEN",
  "KIR",
  "PRK",
  "KOR",
  "KWT",
  "KGZ",
  "LAO",
  "LVA",
  "LBN",
  "LSO",
  "LBR",
  "LBY",
  "LIE",
  "LTU",
  "LUX",
  "MDG",
  "MWI",
  "MYS",
  "MDV",
  "MLI",
  "MLT",
  "MHL",
  "MRT",
  "MUS",
  "MEX",
  "FSM",
  "MDA",
  "MCO",
  "MNG",
  "MNE",
  "MAR",
  "MOZ",
  "MMR",
  "NAM",
  "NRU",
  "NPL",
  "NLD",
  "NZL",
  "NIC",
  "NER",
  "NGA",
  "MKD",
  "NOR",
  "OMN",
  "PAK",
  "PLW",
  "PAN",
  "PNG",
  "PRY",
  "PER",
  "PHL",
  "POL",
  "PRT",
  "QAT",
  "ROU",
  "RUS",
  "RWA",
  "KNA",
  "LCA",
  "VCT",
  "WSM",
  "SMR",
  "STP",
  "SAU",
  "SEN",
  "SRB",
  "SYC",
  "SLE",
  "SGP",
  "SVK",
  "SVN",
  "SLB",
  "SOM",
  "ZAF",
  "SSD",
  "ESP",
  "LKA",
  "SDN",
  "SUR",
  "SWE",
  "CHE",
  "SYR",
  "TJK",
  "TZA",
  "THA",
  "TLS",
  "TGO",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TKM",
  "TUV",
  "UGA",
  "UKR",
  "ARE",
  "GBR",
  "USA",
  "URY",
  "UZB",
  "VUT",
  "VAT",
  "VEN",
  "VNM",
  "YEM",
  "ZMB",
  "ZWE",
  "UTO",
  "XOM",
  "XXA",
  "XXB",
  "XXX",
]);

function isCountryCode(value: string): boolean {
  return COUNTRY_CODES.has(value.toUpperCase());
}

function isValidDateString(value: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (isNaN(date.getTime())) return false;
  const [y, m, d] = value.split("-").map(Number);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

function parseDate(value: string): Date | null {
  if (!isValidDateString(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return isNaN(date.getTime()) ? null : date;
}

function getAgeYears(dateOfBirth: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

function isValidNameChar(value: string): boolean {
  if (!value || value.length < 1) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ\s'\-.]+$/.test(value);
}

function isValidPassportNumber(value: string): boolean {
  if (!value || value.length < 5 || value.length > 20) return false;
  return /^[A-Z0-9<]+$/.test(value);
}

function isValidGender(value: string): boolean {
  return value === "M" || value === "F" || value === "X" || value === "UNKNOWN";
}

function cleanTrailingOcrNoise(value: string): string {
  if (!value) return value;
  let cleaned = value.trim();
  const trailingNoiseMatch = cleaned.match(/^([A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ\s'\-.]+?)[^A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ\s'\-.]+$/);
  if (trailingNoiseMatch) {
    cleaned = trailingNoiseMatch[1]!.trim();
  }
  const leadingNoiseMatch = cleaned.match(/^[^A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ\s'\-.]+(.+)$/);
  if (leadingNoiseMatch) {
    cleaned = leadingNoiseMatch[1]!.trim();
  }
  return cleaned;
}

function hasAmbiguousChars(value: string): boolean {
  return /[OIL]/.test(value);
}

function findBestCountryCodeRepair(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 2 || cleaned.length > 4) return null;
  if (COUNTRY_CODES.has(cleaned)) return cleaned;
  if (COUNTRY_REPAIR_MAP[cleaned]) return COUNTRY_REPAIR_MAP[cleaned]!;
  for (const entry of COMMON_OCR_COUNTRY_ERRORS) {
    if (entry.pattern.test(cleaned)) {
      return entry.replacement;
    }
  }
  return null;
}

function validateNameField(
  fieldName: string,
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];
  const cleanedValue = cleanTrailingOcrNoise(value);
  const wasCleaned = cleanedValue !== value;

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: `${fieldName} is empty` });
  } else if (!isValidNameChar(cleanedValue)) {
    issues.push({ severity: "error", code: "INVALID_FORMAT", message: `${fieldName} contains invalid characters` });
  }

  if (wasCleaned && cleanedValue.length > 0) {
    issues.push({
      severity: "warning",
      code: "TRAILING_OCR_NOISE",
      message: `${fieldName} had trailing OCR noise removed`,
    });
  }

  if (value && value.length > 100) {
    issues.push({ severity: "warning", code: "TOO_LONG", message: `${fieldName} is unusually long` });
  }

  return buildResult(fieldName, wasCleaned ? cleanedValue : value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validatePassportNumberField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];
  const cleanedValue = value.trim().toUpperCase().replace(/</g, "");

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Passport number is empty" });
  } else if (!isValidPassportNumber(cleanedValue)) {
    issues.push({ severity: "error", code: "INVALID_FORMAT", message: "Passport number has invalid format" });
  }

  if (value && cleanedValue !== value) {
    issues.push({
      severity: "warning",
      code: "PASSPORT_NORMALIZED",
      message: "Passport number normalized (fill chars removed)",
    });
  }

  if (cleanedValue && hasAmbiguousChars(cleanedValue)) {
    issues.push({
      severity: "warning",
      code: "AMBIGUOUS_CHARS",
      message: "Passport number contains ambiguous characters (O, I, L)",
    });
  }

  if (cleanedValue && cleanedValue.length < 5) {
    issues.push({
      severity: "error",
      code: "TOO_SHORT",
      message: "Passport number is too short (minimum 5 characters)",
    });
  }

  return buildResult("passportNumber", cleanedValue || value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validateCountryCodeField(
  fieldName: string,
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];
  let finalValue = value;
  let repairedFrom: string | undefined;

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: `${fieldName} is empty` });
  } else {
    const cleaned = value.trim().toUpperCase().replace(/</g, "");
    if (cleaned.length !== 3) {
      issues.push({ severity: "error", code: "INVALID_LENGTH", message: `${fieldName} code must be 3 characters` });
    } else if (!isCountryCode(cleaned)) {
      if (config.enableCountryRepair) {
        const repair = findBestCountryCodeRepair(cleaned);
        if (repair) {
          finalValue = repair;
          repairedFrom = cleaned;
          issues.push({
            severity: "warning",
            code: "COUNTRY_CODE_REPAIRED",
            message: `${fieldName} repaired from ${cleaned} to ${repair}`,
          });
        } else {
          issues.push({
            severity: "warning",
            code: "UNRECOGNIZED_COUNTRY",
            message: `Unrecognized ${fieldName} code: ${cleaned}`,
          });
        }
      } else {
        issues.push({
          severity: "warning",
          code: "UNRECOGNIZED_COUNTRY",
          message: `Unrecognized ${fieldName} code: ${cleaned}`,
        });
      }
    } else {
      finalValue = cleaned;
    }
  }

  if (!repairedFrom && value !== finalValue) {
    repairedFrom = value;
  }

  return buildResult(fieldName, finalValue, rawValue, confidence, corrected, issues, config, {
    repairedFrom,
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validateDateOfBirthField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Date of birth is empty" });
  } else if (!isValidDateString(value)) {
    issues.push({ severity: "error", code: "INVALID_DATE", message: "Date of birth is not a valid date" });
  } else {
    const date = parseDate(value);
    if (date) {
      const now = new Date();
      if (date > now) {
        issues.push({ severity: "error", code: "FUTURE_DATE", message: "Date of birth cannot be in the future" });
      }
      const minDate = new Date("1900-01-01");
      if (date < minDate) {
        issues.push({ severity: "warning", code: "UNUSUALLY_OLD", message: "Date of birth is before 1900" });
      }
      const age = getAgeYears(date);
      if (age < 0 || age > 120) {
        issues.push({ severity: "warning", code: "UNUSUAL_AGE", message: `Calculated age (${age}) seems unusual` });
      }
    }
  }

  return buildResult("dateOfBirth", value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validateExpiryDateField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Expiry date is empty" });
  } else if (!isValidDateString(value)) {
    issues.push({ severity: "error", code: "INVALID_DATE", message: "Expiry date is not a valid date" });
  } else {
    const date = parseDate(value);
    if (date) {
      const now = new Date();
      const expiringSoon = new Date();
      expiringSoon.setMonth(expiringSoon.getMonth() + 3);
      if (date < now) {
        issues.push({ severity: "error", code: "EXPIRED", message: "Document has expired" });
      } else if (date < expiringSoon) {
        issues.push({ severity: "warning", code: "EXPIRING_SOON", message: "Document expires within 3 months" });
      }
      const maxDate = new Date("2100-01-01");
      if (date > maxDate) {
        issues.push({
          severity: "warning",
          code: "UNUSUAL_EXPIRY",
          message: "Expiry date is unusually far in the future",
        });
      }
    }
  }

  return buildResult("expiryDate", value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validateGenderField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Gender is empty" });
  } else if (!isValidGender(value)) {
    issues.push({ severity: "error", code: "INVALID_GENDER", message: `Unrecognized gender value: ${value}` });
  } else if (value === "UNKNOWN") {
    issues.push({ severity: "warning", code: "GENDER_UNKNOWN", message: "Gender could not be determined" });
  }

  return buildResult("gender", value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function validateDocumentTypeField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
  options?: FieldValidationOptions,
): FieldValidationResult {
  const issues: FieldIssue[] = [];
  const supportedTypes = ["PASSPORT", "ID_CARD", "UNKNOWN"];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Document type is empty" });
  } else if (!supportedTypes.includes(value)) {
    issues.push({ severity: "warning", code: "UNSUPPORTED_TYPE", message: `Unsupported document type: ${value}` });
  }

  return buildResult("documentType", value, rawValue, confidence, corrected, issues, config, {
    mrzValid: options?.mrzValid,
    mrzCheckDigitsPassed: options?.mrzCheckDigitsPassed,
  });
}

function buildResult(
  fieldName: string,
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  issues: FieldIssue[],
  config: ValidationConfig,
  options?: {
    repairedFrom?: string;
    mrzValid?: boolean;
    mrzCheckDigitsPassed?: boolean;
  },
): FieldValidationResult {
  const hasError = issues.some((i) => i.severity === "error");
  let adjustedConfidence = confidence;

  if (corrected || options?.repairedFrom) {
    adjustedConfidence = Math.max(0, adjustedConfidence - config.correctionPenalty);
  }

  if (config.mrzBoostEnabled && options?.mrzCheckDigitsPassed) {
    adjustedConfidence = Math.min(1, adjustedConfidence + config.mrzBoostAmount);
  }

  if (options?.mrzValid && !options?.mrzCheckDigitsPassed) {
    adjustedConfidence = Math.min(1, adjustedConfidence + config.mrzBoostAmount * 0.5);
  }

  const needsReview = adjustedConfidence < config.reviewThreshold || hasError;

  return {
    fieldName,
    value,
    rawValue,
    confidence,
    adjustedConfidence,
    valid: !hasError && adjustedConfidence >= config.minConfidence,
    issues,
    needsReview,
    corrected: corrected || !!options?.repairedFrom,
    repairedFrom: options?.repairedFrom,
  };
}

export function createFieldValidatorService(): FieldValidatorService {
  return new DefaultFieldValidatorService();
}

class DefaultFieldValidatorService implements FieldValidatorService {
  validateField(
    fieldName: string,
    value: string,
    rawValue: string,
    confidence: number,
    options?: FieldValidationOptions,
  ): FieldValidationResult {
    const config: ValidationConfig = { ...DEFAULT_VALIDATION_CONFIG, ...options?.config };
    const corrected = options?.corrected ?? false;

    switch (fieldName) {
      case "fullName":
      case "surname":
      case "givenName":
      case "firstName":
      case "lastName":
        return validateNameField(fieldName, value, rawValue, confidence, corrected, config, options);
      case "passportNumber":
      case "documentNumber":
        return validatePassportNumberField(value, rawValue, confidence, corrected, config, options);
      case "nationality":
      case "issuingCountry":
      case "countryCode":
        return validateCountryCodeField(fieldName, value, rawValue, confidence, corrected, config, options);
      case "dateOfBirth":
        return validateDateOfBirthField(value, rawValue, confidence, corrected, config, options);
      case "expiryDate":
      case "idExpiryDate":
        return validateExpiryDateField(value, rawValue, confidence, corrected, config, options);
      case "gender":
        return validateGenderField(value, rawValue, confidence, corrected, config, options);
      case "documentType":
        return validateDocumentTypeField(value, rawValue, confidence, corrected, config, options);
      default:
        return {
          fieldName,
          value,
          rawValue,
          confidence,
          adjustedConfidence: confidence,
          valid: value.length > 0,
          issues: [],
          needsReview: false,
          corrected,
        };
    }
  }

  validateExtractedFields(fields: DocumentFields, options?: FieldValidationOptions): FieldValidationResult[] {
    const results: FieldValidationResult[] = [];
    const fieldMap: Array<{ name: string; value?: string; rawValue?: string; corrected?: boolean }> = [
      { name: "fullName", value: fields.fullName, corrected: false },
      { name: "surname", value: fields.surname, corrected: false },
      { name: "givenName", value: fields.givenName, corrected: false },
      { name: "passportNumber", value: fields.passportNumber, corrected: false },
      { name: "nationality", value: fields.nationality, corrected: false },
      { name: "dateOfBirth", value: fields.dateOfBirth, corrected: false },
      { name: "expiryDate", value: fields.expiryDate, corrected: false },
      { name: "gender", value: fields.gender, corrected: false },
      { name: "issuingCountry", value: fields.issuingCountry, corrected: false },
      { name: "documentType", value: fields.documentType, corrected: false },
      { name: "idNumber", value: fields.idNumber, corrected: false },
    ];

    for (const entry of fieldMap) {
      if (entry.value !== undefined && entry.value !== "") {
        const result = this.validateField(entry.name, entry.value, entry.value, 0.85, {
          ...options,
          corrected: entry.corrected,
        });
        results.push(result);
      }
    }

    return results;
  }

  repairCountryCode(code: string): { repaired: boolean; repairedCode: string | null } {
    if (!code || code.trim().length === 0) {
      return { repaired: false, repairedCode: null };
    }
    const cleaned = code.trim().toUpperCase().replace(/</g, "");
    if (isCountryCode(cleaned)) {
      return { repaired: false, repairedCode: null };
    }
    const repair = findBestCountryCodeRepair(cleaned);
    if (repair) {
      return { repaired: true, repairedCode: repair };
    }
    return { repaired: false, repairedCode: null };
  }

  repairNationality(nationality: string, issuingCountry: string): { repaired: boolean; repairedCode: string } {
    if (!nationality || nationality.trim().length === 0) {
      return { repaired: false, repairedCode: nationality };
    }
    const cleaned = nationality.trim().toUpperCase().replace(/</g, "");
    if (isCountryCode(cleaned)) {
      return { repaired: false, repairedCode: cleaned };
    }
    const repair = findBestCountryCodeRepair(cleaned);
    if (repair) {
      return { repaired: true, repairedCode: repair };
    }
    if (issuingCountry && isCountryCode(issuingCountry)) {
      logger.warn("FieldValidator: nationality invalid, using issuing country as fallback", {
        nationality: cleaned,
        issuingCountry,
      });
      return { repaired: true, repairedCode: issuingCountry };
    }
    return { repaired: false, repairedCode: nationality };
  }

  isValidCountryCode(code: string): boolean {
    return isCountryCode(code.trim().toUpperCase());
  }

  getValidationWarnings(results: FieldValidationResult[]): OcrWarning[] {
    const warnings: OcrWarning[] = [];

    for (const result of results) {
      for (const issue of result.issues) {
        switch (issue.code) {
          case "COUNTRY_CODE_REPAIRED":
            if (!warnings.includes("COUNTRY_CODE_REPAIRED")) {
              warnings.push("COUNTRY_CODE_REPAIRED");
            }
            break;
          case "AMBIGUOUS_CHARS":
            if (!warnings.includes("PASSPORT_NUMBER_REPAIRED")) {
              warnings.push("PASSPORT_NUMBER_REPAIRED");
            }
            break;
          case "TRAILING_OCR_NOISE":
            if (!warnings.includes("LOW_CONFIDENCE_FIELD")) {
              warnings.push("LOW_CONFIDENCE_FIELD");
            }
            break;
          default:
            break;
        }
      }
      if (
        result.needsReview &&
        !result.issues.some(
          (i) => i.code === "COUNTRY_CODE_REPAIRED" || i.code === "AMBIGUOUS_CHARS" || i.code === "TRAILING_OCR_NOISE",
        )
      ) {
        if (!warnings.includes("LOW_CONFIDENCE_FIELD")) {
          warnings.push("LOW_CONFIDENCE_FIELD");
        }
      }
    }

    return warnings;
  }
}
