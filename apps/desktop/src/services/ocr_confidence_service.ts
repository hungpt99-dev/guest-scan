import type { OcrTextResult } from "../ocr/ocr_engine";
import type { NormalizedFields } from "./field_normalization_service";
import type { ConfidenceLevel } from "@guestfill/shared";
import { logger } from "../lib/logger";
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  CHECK_DIGIT_BONUS,
  CHECK_DIGIT_PENALTY,
  EMPTY_FIELD_PENALTY,
  INVALID_DATE_PENALTY,
  GENDER_BONUS,
  DOC_TYPE_BONUS,
  INVALID_COUNTRY_PENALTY,
  LOW_OCR_PENALTY,
} from "../config/constants";

export type FieldConfidenceScore = {
  score: number;
  level: ConfidenceLevel;
  issues: string[];
};

export type FieldConfidenceScores = {
  fullName: FieldConfidenceScore;
  firstName: FieldConfidenceScore;
  lastName: FieldConfidenceScore;
  gender: FieldConfidenceScore;
  dateOfBirth: FieldConfidenceScore;
  nationality: FieldConfidenceScore;
  countryCode: FieldConfidenceScore;
  documentType: FieldConfidenceScore;
  documentNumber: FieldConfidenceScore;
  passportNumber: FieldConfidenceScore;
  idNumber: FieldConfidenceScore;
  issueDate: FieldConfidenceScore;
  expiryDate: FieldConfidenceScore;
  issuingCountry: FieldConfidenceScore;
  mrzRaw: FieldConfidenceScore;
};

export type OverallConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "FAILED";

export type OverallConfidence = {
  overallScore: number;
  overallLevel: OverallConfidenceLevel;
  fieldCount: number;
  validFieldCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  failedCount: number;
};

const IMPORTANT_FIELDS: (keyof FieldConfidenceScores)[] = [
  "passportNumber",
  "fullName",
  "dateOfBirth",
  "gender",
  "nationality",
  "expiryDate",
  "issuingCountry",
];

export interface OcrConfidenceService {
  calculateConfidence(
    fields: NormalizedFields,
    rawOcrResult: OcrTextResult,
    checkDigits?: Record<string, boolean>,
  ): FieldConfidenceScores;

  calculateOverallConfidence(
    fieldScores: FieldConfidenceScores,
    importantFields?: (keyof FieldConfidenceScores)[],
  ): OverallConfidence;
}

const HIGH_THRESHOLD = HIGH_CONFIDENCE_THRESHOLD;
const MEDIUM_THRESHOLD = MEDIUM_CONFIDENCE_THRESHOLD;
const LOW_THRESHOLD = 0.2;

const FIELD_WEIGHTS: Partial<Record<keyof FieldConfidenceScores, number>> = {
  passportNumber: 1.5,
  fullName: 1.5,
  dateOfBirth: 1.0,
  gender: 0.8,
  nationality: 1.0,
  expiryDate: 1.0,
  issuingCountry: 0.8,
};

const ISO3_COUNTRIES = new Set<string>([
  "ABW",
  "AFG",
  "AGO",
  "AIA",
  "ALA",
  "ALB",
  "AND",
  "ARE",
  "ARG",
  "ARM",
  "ASM",
  "ATA",
  "ATF",
  "ATG",
  "AUS",
  "AUT",
  "AZE",
  "BDI",
  "BEL",
  "BEN",
  "BES",
  "BFA",
  "BGD",
  "BGR",
  "BHR",
  "BHS",
  "BIH",
  "BLM",
  "BLR",
  "BLZ",
  "BMU",
  "BOL",
  "BRA",
  "BRB",
  "BRN",
  "BTN",
  "BVT",
  "BWA",
  "CAF",
  "CAN",
  "CCK",
  "CHE",
  "CHL",
  "CHN",
  "CIV",
  "CMR",
  "COD",
  "COG",
  "COK",
  "COL",
  "COM",
  "CPV",
  "CRI",
  "CUB",
  "CUW",
  "CXR",
  "CYM",
  "CYP",
  "CZE",
  "DEU",
  "DJI",
  "DMA",
  "DNK",
  "DOM",
  "DZA",
  "ECU",
  "EGY",
  "ERI",
  "ESH",
  "ESP",
  "EST",
  "ETH",
  "FIN",
  "FJI",
  "FLK",
  "FRA",
  "FRO",
  "FSM",
  "GAB",
  "GBR",
  "GEO",
  "GGY",
  "GHA",
  "GIB",
  "GIN",
  "GLP",
  "GMB",
  "GNB",
  "GNQ",
  "GRC",
  "GRD",
  "GRL",
  "GTM",
  "GUF",
  "GUM",
  "GUY",
  "HKG",
  "HMD",
  "HND",
  "HRV",
  "HTI",
  "HUN",
  "IDN",
  "IMN",
  "IND",
  "IOT",
  "IRL",
  "IRN",
  "IRQ",
  "ISL",
  "ISR",
  "ITA",
  "JAM",
  "JEY",
  "JOR",
  "JPN",
  "KAZ",
  "KEN",
  "KGZ",
  "KHM",
  "KIR",
  "KNA",
  "KOR",
  "KWT",
  "LAO",
  "LBN",
  "LBR",
  "LBY",
  "LCA",
  "LIE",
  "LKA",
  "LSO",
  "LTU",
  "LUX",
  "LVA",
  "MAC",
  "MAF",
  "MAR",
  "MCO",
  "MDA",
  "MDG",
  "MDV",
  "MEX",
  "MHL",
  "MKD",
  "MLI",
  "MLT",
  "MMR",
  "MNE",
  "MNG",
  "MNP",
  "MOZ",
  "MRT",
  "MSR",
  "MTQ",
  "MUS",
  "MWI",
  "MYS",
  "MYT",
  "NAM",
  "NCL",
  "NER",
  "NFK",
  "NGA",
  "NIC",
  "NIU",
  "NLD",
  "NOR",
  "NPL",
  "NRU",
  "NZL",
  "OMN",
  "PAK",
  "PAN",
  "PCN",
  "PER",
  "PHL",
  "PLW",
  "PNG",
  "POL",
  "PRI",
  "PRK",
  "PRT",
  "PRY",
  "PSE",
  "PYF",
  "QAT",
  "REU",
  "ROU",
  "RUS",
  "RWA",
  "SAU",
  "SDN",
  "SEN",
  "SGP",
  "SGS",
  "SHN",
  "SJM",
  "SLB",
  "SLE",
  "SLV",
  "SMR",
  "SOM",
  "SPM",
  "SRB",
  "SSD",
  "STP",
  "SUR",
  "SVK",
  "SVN",
  "SWE",
  "SWZ",
  "SXM",
  "SYC",
  "SYR",
  "TCA",
  "TCD",
  "TGO",
  "THA",
  "TJK",
  "TKL",
  "TKM",
  "TLS",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TUV",
  "TWN",
  "TZA",
  "UGA",
  "UKR",
  "UMI",
  "URY",
  "USA",
  "UZB",
  "VAT",
  "VCT",
  "VEN",
  "VGB",
  "VIR",
  "VNM",
  "VUT",
  "WLF",
  "WSM",
  "YEM",
  "ZAF",
  "ZMB",
  "ZWE",
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

function overallScoreToLevel(score: number): OverallConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  if (score >= LOW_THRESHOLD) return "LOW";
  return "FAILED";
}

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (isNaN(date.getTime())) return false;
  const [y, m, d] = value.split("-").map(Number);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

function isValidIso3(value: string): boolean {
  return value.length === 3 && ISO3_COUNTRIES.has(value);
}

function fieldScore(
  baseScore: number,
  value: string,
  ocrAvg: number,
  options?: {
    checkDigitValid?: boolean;
    validateDate?: boolean;
    validateCountry?: boolean;
    validateGender?: boolean;
    validateDocType?: boolean;
  },
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let adjusted = baseScore;

  if (!value) {
    issues.push("Field is empty");
    adjusted -= EMPTY_FIELD_PENALTY;
  }

  if (options?.checkDigitValid === true) {
    adjusted += CHECK_DIGIT_BONUS;
  } else if (options?.checkDigitValid === false) {
    issues.push("MRZ check digit validation failed");
    adjusted -= CHECK_DIGIT_PENALTY;
  }

  if (options?.validateDate && value) {
    if (!isValidDate(value)) {
      issues.push("Invalid date format or value");
      adjusted -= INVALID_DATE_PENALTY;
    }
  }

  if (options?.validateCountry && value) {
    if (!isValidIso3(value)) {
      issues.push("Invalid country code");
      adjusted -= INVALID_COUNTRY_PENALTY;
    }
  }

  if (options?.validateGender && value) {
    if (value === "M" || value === "F") {
      adjusted += GENDER_BONUS;
    } else if (value !== "UNKNOWN") {
      issues.push("Unexpected gender value");
    }
  }

  if (options?.validateDocType && value) {
    if (value === "PASSPORT" || value === "ID_CARD") {
      adjusted += DOC_TYPE_BONUS;
    }
  }

  if (ocrAvg < 0.6) {
    adjusted -= LOW_OCR_PENALTY;
    issues.push("Low overall OCR confidence");
  }

  return { score: clampScore(adjusted), issues };
}

export function createOcrConfidenceService(): OcrConfidenceService {
  return new DefaultOcrConfidenceService();
}

class DefaultOcrConfidenceService implements OcrConfidenceService {
  calculateConfidence(
    fields: NormalizedFields,
    rawOcrResult: OcrTextResult,
    checkDigits?: Record<string, boolean>,
  ): FieldConfidenceScores {
    const ocrAvg = rawOcrResult.averageConfidence;
    const baseScore = 0.2 + ocrAvg * 0.8;
    const base = clampScore(baseScore);

    logger.debug("OcrConfidenceService: calculating confidence", {
      ocrAverageConfidence: ocrAvg,
      baseScore: base,
    });

    const fullNameScore = fieldScore(base, fields.fullName, ocrAvg);
    const firstNameScore = fieldScore(base, fields.firstName, ocrAvg);
    const lastNameScore = fieldScore(base, fields.lastName, ocrAvg);

    const genderScore = fieldScore(base, fields.gender, ocrAvg, {
      validateGender: true,
    });

    const dateOfBirthScore = fieldScore(base, fields.dateOfBirth, ocrAvg, {
      validateDate: true,
      checkDigitValid: checkDigits?.date_of_birth_valid,
    });

    const nationalityScore = fieldScore(base, fields.nationality, ocrAvg, {
      validateCountry: true,
    });

    const countryCodeScore = fieldScore(base, fields.countryCode, ocrAvg, {
      validateCountry: true,
    });

    const documentTypeScore = fieldScore(base, fields.documentType, ocrAvg, {
      validateDocType: true,
    });

    const documentNumberScore = fieldScore(base, fields.documentNumber, ocrAvg, {
      checkDigitValid: checkDigits?.document_number_valid ?? checkDigits?.passport_number_valid,
    });

    const passportNumberScore = fieldScore(base, fields.passportNumber, ocrAvg, {
      checkDigitValid: checkDigits?.passport_number_valid,
    });

    const idNumberScore = fieldScore(base, fields.idNumber, ocrAvg);

    const issueDateScore = fieldScore(base, fields.issueDate, ocrAvg, {
      validateDate: true,
      checkDigitValid: checkDigits?.optional_data_valid,
    });

    const expiryDateScore = fieldScore(base, fields.expiryDate, ocrAvg, {
      validateDate: true,
      checkDigitValid: checkDigits?.expiry_date_valid,
    });

    const issuingCountryScore = fieldScore(base, fields.issuingCountry, ocrAvg, {
      validateCountry: true,
    });

    let mrzRawScoreValue: number;
    let mrzRawIssues: string[];
    if (rawOcrResult.lines.length > 0) {
      const lineScores = rawOcrResult.lines.map((l) => l.confidence);
      const avgLineConfidence = lineScores.reduce((a, b) => a + b, 0) / lineScores.length;
      mrzRawScoreValue = clampScore(avgLineConfidence * 0.8 + base * 0.2);
      mrzRawIssues = avgLineConfidence < 0.6 ? ["Low MRZ line confidence"] : [];
    } else {
      mrzRawScoreValue = base;
      mrzRawIssues = fields.mrzRaw ? [] : ["MRZ raw text is empty"];
    }

    return {
      fullName: { ...fullNameScore, level: scoreToLevel(fullNameScore.score) },
      firstName: { ...firstNameScore, level: scoreToLevel(firstNameScore.score) },
      lastName: { ...lastNameScore, level: scoreToLevel(lastNameScore.score) },
      gender: { ...genderScore, level: scoreToLevel(genderScore.score) },
      dateOfBirth: { ...dateOfBirthScore, level: scoreToLevel(dateOfBirthScore.score) },
      nationality: { ...nationalityScore, level: scoreToLevel(nationalityScore.score) },
      countryCode: { ...countryCodeScore, level: scoreToLevel(countryCodeScore.score) },
      documentType: { ...documentTypeScore, level: scoreToLevel(documentTypeScore.score) },
      documentNumber: { ...documentNumberScore, level: scoreToLevel(documentNumberScore.score) },
      passportNumber: { ...passportNumberScore, level: scoreToLevel(passportNumberScore.score) },
      idNumber: { ...idNumberScore, level: scoreToLevel(idNumberScore.score) },
      issueDate: { ...issueDateScore, level: scoreToLevel(issueDateScore.score) },
      expiryDate: { ...expiryDateScore, level: scoreToLevel(expiryDateScore.score) },
      issuingCountry: { ...issuingCountryScore, level: scoreToLevel(issuingCountryScore.score) },
      mrzRaw: { score: mrzRawScoreValue, level: scoreToLevel(mrzRawScoreValue), issues: mrzRawIssues },
    };
  }

  calculateOverallConfidence(
    fieldScores: FieldConfidenceScores,
    importantFields?: (keyof FieldConfidenceScores)[],
  ): OverallConfidence {
    const fields = importantFields ?? IMPORTANT_FIELDS;

    let totalWeight = 0;
    let weightedSum = 0;
    let fieldCount = 0;
    let validFieldCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let failedCount = 0;

    for (const fieldName of fields) {
      const fs = fieldScores[fieldName];
      if (!fs) continue;
      fieldCount++;
      const weight = FIELD_WEIGHTS[fieldName] ?? 1.0;
      totalWeight += weight;
      weightedSum += fs.score * weight;

      if (fs.level === "HIGH") highCount++;
      else if (fs.level === "MEDIUM") mediumCount++;
      else if (fs.level === "LOW") lowCount++;
      else failedCount++;

      if (fs.score >= MEDIUM_THRESHOLD && fs.issues.length === 0) {
        validFieldCount++;
      }
    }

    const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

    const overallLevel = overallScoreToLevel(overallScore);

    logger.debug("OcrConfidenceService: overall confidence calculated", {
      overallScore,
      overallLevel,
      fieldCount,
      validFieldCount,
      highCount,
      mediumCount,
      lowCount,
      failedCount,
    });

    return {
      overallScore,
      overallLevel,
      fieldCount,
      validFieldCount,
      highCount,
      mediumCount,
      lowCount,
      failedCount,
    };
  }
}
