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
};

export type FieldIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ValidationConfig = {
  minConfidence: number;
  reviewThreshold: number;
  mrzBoostEnabled: boolean;
  mrzBoostAmount: number;
  correctionPenalty: number;
};

export type DocumentFields = {
  surname?: string;
  givenName?: string;
  fullName?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: string;
  expiryDate?: string;
  issuingCountry?: string;
  documentType?: string;
  optionalData?: string;
};

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minConfidence: 0.4,
  reviewThreshold: 0.7,
  mrzBoostEnabled: true,
  mrzBoostAmount: 0.15,
  correctionPenalty: 0.1,
};

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

function isValidGender(value: string): boolean {
  return value === "M" || value === "F" || value === "UNKNOWN";
}

function isValidName(value: string): boolean {
  if (!value || value.length < 1) return false;
  return /^[A-Za-zÀ-ÿ\s'\-.]+$/.test(value);
}

function isValidPassportNumber(value: string): boolean {
  if (!value || value.length < 5 || value.length > 20) return false;
  return /^[A-Z0-9<]+$/.test(value);
}

function validateNameField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Name field is empty" });
  } else if (!isValidName(value)) {
    issues.push({ severity: "error", code: "INVALID_FORMAT", message: "Name contains invalid characters" });
  }

  if (value && value.length > 100) {
    issues.push({ severity: "warning", code: "TOO_LONG", message: "Name is unusually long" });
  }

  return buildResult("fullName", value, rawValue, confidence, corrected, issues, config);
}

function validatePassportNumberField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Passport number is empty" });
  } else if (!isValidPassportNumber(value)) {
    issues.push({ severity: "error", code: "INVALID_FORMAT", message: "Passport number has invalid format" });
  }

  if (value && /[OIL]/.test(value)) {
    issues.push({
      severity: "warning",
      code: "AMBIGUOUS_CHARS",
      message: "Passport number contains ambiguous characters (O, I, L)",
    });
  }

  return buildResult("passportNumber", value, rawValue, confidence, corrected, issues, config);
}

function validateNationalityField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Nationality is empty" });
  } else if (value.length !== 3) {
    issues.push({ severity: "error", code: "INVALID_LENGTH", message: "Nationality code must be 3 characters" });
  } else if (!isCountryCode(value)) {
    issues.push({ severity: "warning", code: "UNRECOGNIZED_COUNTRY", message: `Unrecognized country code: ${value}` });
  }

  return buildResult("nationality", value, rawValue, confidence, corrected, issues, config);
}

function validateDateOfBirthField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
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
      const age = now.getFullYear() - date.getFullYear();
      if (age < 0 || age > 120) {
        issues.push({ severity: "warning", code: "UNUSUAL_AGE", message: "Calculated age seems unusual" });
      }
    }
  }

  return buildResult("dateOfBirth", value, rawValue, confidence, corrected, issues, config);
}

function validateExpiryDateField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Expiry date is empty" });
  } else if (!isValidDateString(value)) {
    issues.push({ severity: "error", code: "INVALID_DATE", message: "Expiry date is not a valid date" });
  } else {
    const date = parseDate(value);
    if (date) {
      const expiringSoon = new Date();
      expiringSoon.setMonth(expiringSoon.getMonth() + 3);
      if (date < new Date()) {
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

  return buildResult("expiryDate", value, rawValue, confidence, corrected, issues, config);
}

function validateGenderField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Gender is empty" });
  } else if (!isValidGender(value)) {
    issues.push({ severity: "error", code: "INVALID_GENDER", message: `Unrecognized gender value: ${value}` });
  } else if (value === "UNKNOWN") {
    issues.push({ severity: "warning", code: "GENDER_UNKNOWN", message: "Gender could not be determined from MRZ" });
  }

  return buildResult("gender", value, rawValue, confidence, corrected, issues, config);
}

function validateIssuingCountryField(
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  config: ValidationConfig,
): FieldValidationResult {
  const issues: FieldIssue[] = [];

  if (!value || value.trim().length === 0) {
    issues.push({ severity: "error", code: "FIELD_EMPTY", message: "Issuing country is empty" });
  } else if (value.length !== 3) {
    issues.push({ severity: "error", code: "INVALID_LENGTH", message: "Country code must be 3 characters" });
  } else if (!isCountryCode(value)) {
    issues.push({ severity: "warning", code: "UNRECOGNIZED_COUNTRY", message: `Unrecognized country code: ${value}` });
  }

  return buildResult("issuingCountry", value, rawValue, confidence, corrected, issues, config);
}

function buildResult(
  fieldName: string,
  value: string,
  rawValue: string,
  confidence: number,
  corrected: boolean,
  issues: FieldIssue[],
  config: ValidationConfig,
): FieldValidationResult {
  const hasError = issues.some((i) => i.severity === "error");
  let adjustedConfidence = confidence;

  if (corrected) {
    adjustedConfidence = Math.max(0, adjustedConfidence - config.correctionPenalty);
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
    corrected,
  };
}

export function validateField(
  fieldName: string,
  value: string,
  rawValue: string,
  confidence: number,
  options?: {
    corrected?: boolean;
    mrzValid?: boolean;
    config?: Partial<ValidationConfig>;
  },
): FieldValidationResult {
  const config: ValidationConfig = { ...DEFAULT_VALIDATION_CONFIG, ...options?.config };
  const corrected = options?.corrected ?? false;
  const mrzValid = options?.mrzValid ?? false;

  let adjustedConfidence = confidence;
  if (config.mrzBoostEnabled && mrzValid) {
    adjustedConfidence = Math.min(1, adjustedConfidence + config.mrzBoostAmount);
  }

  switch (fieldName) {
    case "fullName":
    case "surname":
    case "givenName":
      return validateNameField(value, rawValue, adjustedConfidence, corrected, config);
    case "passportNumber":
      return validatePassportNumberField(value, rawValue, adjustedConfidence, corrected, config);
    case "nationality":
      return validateNationalityField(value, rawValue, adjustedConfidence, corrected, config);
    case "dateOfBirth":
      return validateDateOfBirthField(value, rawValue, adjustedConfidence, corrected, config);
    case "expiryDate":
      return validateExpiryDateField(value, rawValue, adjustedConfidence, corrected, config);
    case "gender":
      return validateGenderField(value, rawValue, adjustedConfidence, corrected, config);
    case "issuingCountry":
      return validateIssuingCountryField(value, rawValue, adjustedConfidence, corrected, config);
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

export function validateExtractedFields(
  fields: DocumentFields,
  options?: {
    mrzValid?: boolean;
    config?: Partial<ValidationConfig>;
  },
): FieldValidationResult[] {
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
  ];

  for (const entry of fieldMap) {
    if (entry.value !== undefined && entry.value !== "") {
      const result = validateField(entry.name, entry.value, entry.value, 0.85, {
        corrected: entry.corrected,
        mrzValid: options?.mrzValid,
        config: options?.config,
      });
      results.push(result);
    }
  }

  return results;
}

export { needsReview, fieldsRequiringReview, getOverallConfidence, isReadyForAutofill } from "./confidence_scoring";
