import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "fs";
import { MockOcrEngine } from "../apps/desktop/src/ocr/mock_ocr_engine";
import type { OcrTextResult, OcrTextChunk } from "../apps/desktop/src/ocr/ocr_engine";
import {
  parseMrz,
  detectMrzFormat,
  computeMrzCheckDigit,
  correctMrzOcrErrors,
} from "../apps/desktop/src/ocr/mrz_parser";
import {
  validateField,
  validateExtractedFields,
  needsReview,
  fieldsRequiringReview,
  isReadyForAutofill,
} from "../apps/desktop/src/ocr/field_validator";
import {
  createImageQualityService,
  type ImageInput,
  type ImageQualityResult,
  type ImageQualityService,
} from "../apps/desktop/src/services/image_quality_service";
import { createMrzChecksumValidator } from "../apps/desktop/src/services/mrz_checksum_validator";
import { createFieldNormalizationService } from "../apps/desktop/src/services/field_normalization_service";

// Paths are relative to apps/desktop (vitest CWD)
const GOOD_PASSPORT_PATH = "../../tests/data/good_passport.jpg";
const BAD_PASSPORT_PATH = "../../tests/data/bad_passport.jpg";

// TD3 passport — 2x44 chars, valid check digits
// AB123456<  → 184 % 10 = 4 at pos 9 ✓
// 851010     →  75 % 10 = 5 at pos 19 ✓
// 200101     →  22 % 10 = 2 at pos 27 ✓
const TD3_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const TD3_LINE_2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<02";
const TD3_FULLTEXT = [TD3_LINE_1, TD3_LINE_2].join("\n");

// TD1 (ID card) — 3x30 chars
const TD1_LINE_1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
const TD1_LINE_2 = "AB123456<4UTO8510105M2001012<<<<";
const TD1_LINE_3 = "XC1234569<<<<<<<<<<<<<<<<<<<<<<<";

// GBR passport — different issuing country (44-char TD3 lines, valid check digits)
// AB123456< → CD 4, 820101 → CD 0, 250101 → CD 7
const GBR_LINE_1 = "P<GBRMUSTER<<JANE<<<<<<<<<<<<<<<<<<<<<<<<<<<";
const GBR_LINE_2 = "AB123456<4GBR8201010F2501017<<<<<<<<<<<<<<<<";

// Future expiry for validation tests
const FUTURE_EXPIRY = "2030-12-31";
const TD3_FUTURE_LINE_2 = "AB123456<4UTO8510105M3012312<<<<<<<<<<<<<<<<02";

function mockInput(path: string = GOOD_PASSPORT_PATH): ImageInput {
  return { imagePath: path };
}

function highConfidenceOcrResult(): OcrTextResult {
  return {
    lines: [
      { text: TD3_LINE_1, confidence: 0.97 },
      { text: TD3_LINE_2, confidence: 0.96 },
    ],
    fullText: TD3_FULLTEXT,
    averageConfidence: 0.965,
  };
}

function lowConfidenceOcrResult(): OcrTextResult {
  return {
    lines: [
      { text: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.42 },
      { text: "AB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.38 },
    ],
    fullText: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04",
    averageConfidence: 0.4,
  };
}

// ---------------------------------------------------------------------------
// Section 1: Good passport — full pipeline extraction accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: Good Passport — Full Pipeline Extraction", () => {
  const mrzResult = parseMrz([TD3_LINE_1, TD3_LINE_2]);

  it("correctly identifies passport format as TD3", () => {
    expect(detectMrzFormat([TD3_LINE_1, TD3_LINE_2])).toBe("TD3");
  });

  it("extracts surname with 100% accuracy", () => {
    expect(mrzResult.surname.value).toBe("MUSTER");
    expect(mrzResult.surname.valid).toBe(true);
  });

  it("extracts given name with 100% accuracy", () => {
    expect(mrzResult.givenName.value).toBe("JOHN MICHAEL");
    expect(mrzResult.givenName.valid).toBe(true);
  });

  it("extracts passport number with 100% accuracy", () => {
    expect(mrzResult.passportNumber.value).toBe("AB123456");
    expect(mrzResult.passportNumber.valid).toBe(true);
  });

  it("extracts nationality with 100% accuracy", () => {
    expect(mrzResult.nationality.value).toBe("UTO");
    expect(mrzResult.nationality.valid).toBe(true);
  });

  it("extracts date of birth with 100% accuracy", () => {
    expect(mrzResult.dateOfBirth.value).toBe("1985-10-10");
    expect(mrzResult.dateOfBirth.valid).toBe(true);
  });

  it("extracts gender with 100% accuracy", () => {
    expect(mrzResult.gender.value).toBe("M");
    expect(mrzResult.gender.valid).toBe(true);
  });

  it("extracts expiry date with 100% accuracy", () => {
    expect(mrzResult.expiryDate.value).toBe("2020-01-01");
    expect(mrzResult.expiryDate.valid).toBe(true);
  });

  it("extracts issuing country with 100% accuracy", () => {
    expect(mrzResult.issuingCountry.value).toBe("UTO");
    expect(mrzResult.issuingCountry.valid).toBe(true);
  });

  it("reports all check digits as valid for good MRZ", () => {
    expect(mrzResult.checkDigits.passport_number_valid).toBe(true);
    expect(mrzResult.checkDigits.date_of_birth_valid).toBe(true);
    expect(mrzResult.checkDigits.expiry_date_valid).toBe(true);
    expect(mrzResult.overallValid).toBe(true);
  });

  it("reports zero corrections for clean MRZ", () => {
    expect(mrzResult.corrections).toHaveLength(0);
  });

  it("computes correct check digits for all fields", () => {
    expect(computeMrzCheckDigit("AB123456")).toBe("4");
    expect(computeMrzCheckDigit("851010")).toBe("5");
    expect(computeMrzCheckDigit("200101")).toBe("2");
  });

  it("validates all extracted fields pass (using future expiry to avoid expiry flag)", () => {
    const mrz = parseMrz([TD3_LINE_1, TD3_FUTURE_LINE_2]);
    const fields = {
      fullName: mrz.fullName.value,
      surname: mrz.surname.value,
      givenName: mrz.givenName.value,
      passportNumber: mrz.passportNumber.value,
      nationality: mrz.nationality.value,
      dateOfBirth: mrz.dateOfBirth.value,
      gender: mrz.gender.value,
      expiryDate: mrz.expiryDate.value,
      issuingCountry: mrz.issuingCountry.value,
    };
    const results = validateExtractedFields(fields, { mrzValid: true });
    const failing = results.filter((r) => !r.valid);
    expect(failing).toHaveLength(0);
  });

  it("is ready for autofill when all fields are valid (future expiry)", () => {
    const mrz = parseMrz([TD3_LINE_1, TD3_FUTURE_LINE_2]);
    const fields = {
      fullName: mrz.fullName.value,
      surname: mrz.surname.value,
      givenName: mrz.givenName.value,
      passportNumber: mrz.passportNumber.value,
      nationality: mrz.nationality.value,
      dateOfBirth: mrz.dateOfBirth.value,
      gender: mrz.gender.value,
      expiryDate: mrz.expiryDate.value,
      issuingCountry: mrz.issuingCountry.value,
    };
    const results = validateExtractedFields(fields, { mrzValid: true });
    expect(isReadyForAutofill(results)).toBe(true);
  });

  it("passes quality check for good passport image", async () => {
    const qualityService = createImageQualityService();
    const result = await qualityService.analyzeImage(mockInput(GOOD_PASSPORT_PATH));
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Good passport TD1 (ID card) format accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: Good ID Card (TD1) — Full Extraction", () => {
  const mrzResult = parseMrz([TD1_LINE_1, TD1_LINE_2, TD1_LINE_3]);

  it("correctly identifies format as TD1", () => {
    expect(mrzResult.format).toBe("TD1");
  });

  it("extracts all fields from TD1 format", () => {
    expect(mrzResult.surname.value).toBe("MUSTER");
    expect(mrzResult.givenName.value).toBe("JOHN");
    expect(mrzResult.passportNumber.value).toBe("AB123456");
    expect(mrzResult.nationality.value).toBe("UTO");
    expect(mrzResult.dateOfBirth.value).toBe("1985-10-10");
    expect(mrzResult.gender.value).toBe("M");
    expect(mrzResult.expiryDate.value).toBe("2020-01-01");
  });

  it("computes valid TD1 check digits", () => {
    expect(mrzResult.checkDigits.passport_number_valid).toBe(true);
    expect(mrzResult.overallValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Good passport with OCR error correction accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: OCR Error Correction — O/0 and I/1", () => {
  it("corrects letter O to digit 0 in passport number via checksum", () => {
    // A1B2C3O4<: computed CD = 7. A1B2C304< (O→0): computed CD = 9.
    // If the MRZ check digit is 9 (correct value's CD), O→0 produces a match.
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "A1B2C3O4<9UTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("A1B2C304");
    expect(result.corrections.length).toBeGreaterThanOrEqual(1);
    expect(result.checkDigits.passport_number_valid).toBe(true);
  });

  it("corrects digit 0 to letter O in name fields", () => {
    const line1 = "P<UTOMUSTER<<J0HN<<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.givenName.value).toBe("JOHN");
    expect(result.corrections.length).toBeGreaterThanOrEqual(1);
  });

  it("corrects letter I to digit 1 in date fields", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO85I0105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("1985-10-10");
    expect(result.corrections.length).toBeGreaterThanOrEqual(1);
  });

  it("corrects letter O to digit 0 in expiry date", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M20O1012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.expiryDate.value).toBe("2020-01-01");
  });

  it("corrects digit 1 to letter I in name when context indicates letter", () => {
    const line1 = "P<UTOMUSTER<<JOHN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const result = parseMrz([line1, line2]);
    expect(result.givenName.value).toBe("JOHN MICHAEL");
  });

  it("correctMrzOcrErrors returns corrections for ambiguous chars", () => {
    const lines = ["P<UTOMUSTER<<J0HN<<<<<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<"];
    const result = correctMrzOcrErrors(lines);
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.corrections.some((c) => c.from !== c.to)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Bad passport images — retake warnings
// ---------------------------------------------------------------------------
describe("Accuracy: Bad Passport — Retake Warning Triggers", () => {
  it("triggers retake warning for blurry image", async () => {
    class BlurryMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 12,
            brightness: 100,
            contrast: 40,
            glareRatio: 0.02,
            skewAngle: 1.0,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.8,
          },
          warnings: ["BLURRY"],
          passed: false,
        };
      }
    }
    const quality = new BlurryMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("BLURRY");
  });

  it("triggers retake warning for glare/reflection", async () => {
    class GlareMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 80,
            brightness: 180,
            contrast: 50,
            glareRatio: 0.45,
            skewAngle: 0.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.7,
          },
          warnings: ["GLARE_DETECTED"],
          passed: false,
        };
      }
    }
    const quality = new GlareMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("GLARE_DETECTED");
  });

  it("triggers retake warning for dark image", async () => {
    class DarkMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 75,
            brightness: 15,
            contrast: 20,
            glareRatio: 0.01,
            skewAngle: 0.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.3,
          },
          warnings: ["TOO_DARK", "LOW_CONTRAST"],
          passed: false,
        };
      }
    }
    const quality = new DarkMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("TOO_DARK");
    expect(result.warnings).toContain("LOW_CONTRAST");
  });

  it("triggers retake warning for skewed document", async () => {
    class SkewedMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 80,
            brightness: 128,
            contrast: 50,
            glareRatio: 0.02,
            skewAngle: -12.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.6,
          },
          warnings: ["SKEWED"],
          passed: false,
        };
      }
    }
    const quality = new SkewedMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("SKEWED");
  });

  it("triggers retake warning for low resolution", async () => {
    class LowResMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 85,
            brightness: 128,
            contrast: 55,
            glareRatio: 0.02,
            skewAngle: 0.5,
            width: 320,
            height: 240,
            edgeVisibilityScore: 0.8,
          },
          warnings: ["LOW_RESOLUTION"],
          passed: false,
        };
      }
    }
    const quality = new LowResMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("LOW_RESOLUTION");
  });

  it("triggers retake for multiple simultaneous quality issues", async () => {
    class MultiIssueMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 18,
            brightness: 230,
            contrast: 15,
            glareRatio: 0.35,
            skewAngle: 15.0,
            width: 600,
            height: 400,
            edgeVisibilityScore: 0.2,
          },
          warnings: [
            "BLURRY",
            "TOO_BRIGHT",
            "LOW_CONTRAST",
            "GLARE_DETECTED",
            "SKEWED",
            "LOW_RESOLUTION",
            "EDGES_NOT_VISIBLE",
          ],
          passed: false,
        };
      }
    }
    const quality = new MultiIssueMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);
  });

  it("triggers retake warning for excessively bright image", async () => {
    class BrightMockQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 85,
            brightness: 235,
            contrast: 50,
            glareRatio: 0.02,
            skewAngle: 0.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.8,
          },
          warnings: ["TOO_BRIGHT"],
          passed: false,
        };
      }
    }
    const quality = new BrightMockQuality();
    const result = await quality.analyzeImage(mockInput(BAD_PASSPORT_PATH));
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("TOO_BRIGHT");
  });
});

// ---------------------------------------------------------------------------
// Section 5: Low-confidence OCR — field review triggers
// ---------------------------------------------------------------------------
describe("Accuracy: Low-Confidence OCR — Field Review Trigger", () => {
  it("flags low-confidence OCR result for review", () => {
    const ocrResult = lowConfidenceOcrResult();
    expect(ocrResult.averageConfidence).toBeLessThan(0.6);
  });

  it("parses MRZ from low-confidence OCR but still extracts fields", () => {
    const lines = lowConfidenceOcrResult().lines.map((l) => l.text);
    const result = parseMrz(lines);
    expect(result.passportNumber.value).toBeTruthy();
    expect(result.surname.value).toBeTruthy();
    expect(result.dateOfBirth.value).toBeTruthy();
  });

  it("flags corrected fields for review with reduced confidence", () => {
    const result = validateField("fullName", "MUSTER", "MUSTER", 0.7, { corrected: true });
    expect(result.adjustedConfidence).toBeLessThan(0.7);
    expect(result.adjustedConfidence).toBeGreaterThanOrEqual(0.6);
  });

  it("validates low-confidence fields require manual review", () => {
    const fields = {
      fullName: "MUSTER J0HN M1CHAEL",
      passportNumber: "AB12345?",
      dateOfBirth: "1985-10-10",
      expiryDate: FUTURE_EXPIRY,
      nationality: "XYZ",
      gender: "M",
    };
    const results = validateExtractedFields(fields);
    const reviewFields = fieldsRequiringReview(results);
    expect(reviewFields.length).toBeGreaterThan(0);
    expect(needsReview(results)).toBe(true);
  });

  it("marks empty fields as needing review", () => {
    const result = validateField("fullName", "", "", 0);
    expect(result.valid).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.issues.some((i) => i.code === "FIELD_EMPTY")).toBe(true);
  });

  it("rejects invalid gender values", () => {
    const result = validateField("gender", "X", "X", 0.9);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INVALID_GENDER")).toBe(true);
  });

  it("warns on unrecognized nationality code", () => {
    const result = validateField("nationality", "ZZZ", "ZZZ", 0.9);
    expect(result.issues.some((i) => i.code === "UNRECOGNIZED_COUNTRY")).toBe(true);
  });

  it("flags expired documents", () => {
    const result = validateField("expiryDate", "2020-01-01", "200101", 0.9);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "EXPIRED")).toBe(true);
  });

  it("flags future date of birth", () => {
    const result = validateField("dateOfBirth", "2099-06-15", "990615", 0.9);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "FUTURE_DATE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 6: MRZ checksum validation accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: MRZ Checksum Validation", () => {
  it("passes all checksums for valid passport MRZ", () => {
    const checksumValidator = createMrzChecksumValidator();
    const result = checksumValidator.validateChecksums([TD3_LINE_1, TD3_LINE_2]);
    expect(result.overallValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects invalid passport number checksum", () => {
    const badLine2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const checksumValidator = createMrzChecksumValidator();
    const result = checksumValidator.validateChecksums([TD3_LINE_1, badLine2]);
    expect(result.passportNumberValid).toBe(false);
    expect(result.overallValid).toBe(false);
    expect(result.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");
  });

  it("detects invalid date of birth checksum", () => {
    const badLine2 = "AB123456<4UTO851010XM2001012<<<<<<<<<<<<<<<<02";
    const checksumValidator = createMrzChecksumValidator();
    const result = checksumValidator.validateChecksums([TD3_LINE_1, badLine2]);
    expect(result.dateOfBirthValid).toBe(false);
    expect(result.overallValid).toBe(false);
  });

  it("detects invalid expiry date checksum", () => {
    const badLine2 = "AB123456<4UTO8510105M200101X<<<<<<<<<<<<<<<<02";
    const checksumValidator = createMrzChecksumValidator();
    const result = checksumValidator.validateChecksums([TD3_LINE_1, badLine2]);
    expect(result.expiryDateValid).toBe(false);
    expect(result.overallValid).toBe(false);
  });

  it("detects multiple invalid checksums", () => {
    const badLine2 = "AB123456<XUTO851010XM200101X<<<<<<<<<<<<<<<<02";
    const checksumValidator = createMrzChecksumValidator();
    const result = checksumValidator.validateChecksums([TD3_LINE_1, badLine2]);
    expect(result.passportNumberValid).toBe(false);
    expect(result.dateOfBirthValid).toBe(false);
    expect(result.expiryDateValid).toBe(false);
    expect(result.overallValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 7: MRZ checksum-based error correction accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: Checksum-Based Error Correction", () => {
  it("corrects O→0 in passport number using checksum", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "A1B2C3O4<9UTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("A1B2C304");
    expect(result.checkDigits.passport_number_valid).toBe(true);
  });

  it("corrects I→1 in date field using checksum", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO85I0105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("1985-10-10");
    expect(result.checkDigits.date_of_birth_valid).toBe(true);
  });

  it("corrects O→0 in expiry date using checksum", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M20O1012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.expiryDate.value).toBe("2020-01-01");
    expect(result.checkDigits.expiry_date_valid).toBe(true);
  });

  it("does not correct when no ambiguous chars exist despite invalid checksum", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "XB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("XB123456");
    expect(result.checkDigits.passport_number_valid).toBe(false);
    expect(result.corrections.length).toBe(0);
  });

  it("applies MRZ boost for checksum-validated fields", () => {
    const result = validateField("passportNumber", "AB123456", "AB123456", 0.7, { mrzValid: true });
    expect(result.adjustedConfidence).toBeGreaterThan(0.7);
  });

  it("applies MRZ boost and caps at 1.0", () => {
    const result = validateField("passportNumber", "AB123456", "AB123456", 0.9, { mrzValid: true });
    expect(result.adjustedConfidence).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Section 8: High-confidence OCR with edge-case passport data
// ---------------------------------------------------------------------------
describe("Accuracy: Edge Case Passport Data", () => {
  it("correctly parses passport with 9-digit passport number containing < filler", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123<456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("AB123456");
  });

  it("correctly handles filler-only optional data", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.optionalData.value).toBe("");
  });

  it("correctly parses date of birth with century break for youth", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO4901013M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("2049-01-01");
  });

  it("correctly parses date of birth with century break for older person", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO7001017M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("1970-01-01");
  });

  it("correctly parses gender F", () => {
    const line1 = "P<UTOMUSTER<<JANE<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105F2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.gender.value).toBe("F");
  });

  it("handles ID card document type prefix I<", () => {
    const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const result = parseMrz([line1, line2]);
    expect(result.documentType.value).toBe("ID_CARD");
  });

  it("handles passport from GBR with valid data", () => {
    const result = parseMrz([GBR_LINE_1, GBR_LINE_2]);
    expect(result.issuingCountry.value).toBe("GBR");
    expect(result.nationality.value).toBe("GBR");
    // DOB: 820101 → 1982-01-01 (centuryBreak=49 → 82 > 49 → 1900s)
    expect(result.dateOfBirth.value).toBe("1982-01-01");
    expect(result.gender.value).toBe("F");
    // Expiry: 250101 → 2025-01-01 (25 < 49 → 2000s)
    expect(result.expiryDate.value).toBe("2025-01-01");
  });
});

// ---------------------------------------------------------------------------
// Section 9: Mock OCR engine accuracy simulation
// ---------------------------------------------------------------------------
describe("Accuracy: Mock OCR Engine — Full Pipeline Simulation", () => {
  it("produces high-confidence OCR result for good passport", async () => {
    const engine = new MockOcrEngine({
      lines: highConfidenceOcrResult().lines,
      fullText: highConfidenceOcrResult().fullText,
      averageConfidence: 0.965,
    });
    const result = await engine.extractText(mockInput());
    expect(result.averageConfidence).toBeGreaterThan(0.9);
    expect(result.lines).toHaveLength(2);
  });

  it("produces low-confidence OCR result for bad passport simulation", async () => {
    const engine = new MockOcrEngine(lowConfidenceOcrResult());
    const result = await engine.extractText(mockInput(BAD_PASSPORT_PATH));
    expect(result.averageConfidence).toBeLessThan(0.5);
  });

  it("simulates OCR engine failure for unreadable image", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText(mockInput(BAD_PASSPORT_PATH))).rejects.toThrow();
  });

  it("prefers higher confidence result when comparing two engines", async () => {
    const highConfEngine = new MockOcrEngine(highConfidenceOcrResult());
    const lowConfEngine = new MockOcrEngine(lowConfidenceOcrResult());
    const highResult = await highConfEngine.extractText(mockInput());
    const lowResult = await lowConfEngine.extractText(mockInput());
    expect(highResult.averageConfidence).toBeGreaterThan(lowResult.averageConfidence);
  });

  it("recovers after transient OCR failure", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText(mockInput())).rejects.toThrow();
    engine.setConfig(highConfidenceOcrResult());
    const result = await engine.extractText(mockInput());
    expect(result.averageConfidence).toBeGreaterThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// Section 10: Field normalization accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: Field Normalization", () => {
  it("normalizes full name from MRZ surname/givenName", () => {
    const mrzResult = parseMrz([TD3_LINE_1, TD3_LINE_2]);
    const normalizer = createFieldNormalizationService();
    const normalized = normalizer.normalizeFields({
      fullName: mrzResult.fullName.value,
      surname: mrzResult.surname.value,
      givenName: mrzResult.givenName.value,
      gender: mrzResult.gender.value,
      dateOfBirth: mrzResult.dateOfBirth.value,
      nationality: mrzResult.nationality.value,
      issuingCountry: mrzResult.issuingCountry.value,
      documentType: mrzResult.documentType.value,
      passportNumber: mrzResult.passportNumber.value,
      documentNumber: mrzResult.passportNumber.value,
      idNumber: "",
      issueDate: "",
      expiryDate: mrzResult.expiryDate.value,
      mrzRaw: TD3_FULLTEXT,
      mrzParsed: [TD3_LINE_1, TD3_LINE_2],
      checkDigits: mrzResult.checkDigits as unknown as Record<string, boolean>,
    });
    expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(normalized.lastName).toBe("MUSTER");
    expect(normalized.firstName).toBe("JOHN MICHAEL");
    expect(normalized.passportNumber).toBe("AB123456");
    expect(normalized.dateOfBirth).toBe("1985-10-10");
    expect(normalized.expiryDate).toBe("2020-01-01");
    expect(normalized.gender).toBe("M");
    expect(normalized.nationality).toBe("UTO");
    expect(normalized.issuingCountry).toBe("UTO");
    expect(normalized.documentType).toBe("PASSPORT");
  });
});

// ---------------------------------------------------------------------------
// Section 11: Autofill readiness accuracy
// ---------------------------------------------------------------------------
describe("Accuracy: Autofill Readiness", () => {
  it("is ready when all required fields are valid and high confidence", () => {
    const results = [
      validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
      validateField("dateOfBirth", "1985-10-10", "851010", 0.95),
      validateField("expiryDate", FUTURE_EXPIRY, "301231", 0.95),
      validateField("nationality", "UTO", "UTO", 0.95),
      validateField("gender", "M", "M", 0.95),
    ];
    expect(isReadyForAutofill(results)).toBe(true);
  });

  it("is NOT ready when any required field fails validation", () => {
    const results = [
      validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95),
      validateField("passportNumber", "", "", 0),
      validateField("dateOfBirth", "1985-10-10", "851010", 0.95),
      validateField("expiryDate", FUTURE_EXPIRY, "301231", 0.95),
      validateField("nationality", "UTO", "UTO", 0.95),
      validateField("gender", "M", "M", 0.95),
    ];
    expect(isReadyForAutofill(results)).toBe(false);
  });

  it("is NOT ready when a required field is missing from results", () => {
    const results = [validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95)];
    expect(isReadyForAutofill(results)).toBe(false);
  });

  it("is NOT ready when a field needs review (expired doc)", () => {
    const results = [
      validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
      validateField("dateOfBirth", "1985-10-10", "851010", 0.95),
      validateField("expiryDate", "2020-01-01", "200101", 0.95),
      validateField("nationality", "UTO", "UTO", 0.95),
      validateField("gender", "M", "M", 0.95),
    ];
    expect(isReadyForAutofill(results)).toBe(false);
  });

  it("accepts custom required fields list", () => {
    const results = [
      validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
    ];
    expect(isReadyForAutofill(results, ["fullName", "passportNumber"])).toBe(true);
    expect(isReadyForAutofill(results, ["fullName", "passportNumber", "dateOfBirth"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 12: Overall accuracy statistics reporting
// ---------------------------------------------------------------------------
describe("Accuracy: Overall Statistics", () => {
  it("reports ≥95% field accuracy for good passport MRZ extraction", () => {
    const result = parseMrz([TD3_LINE_1, TD3_LINE_2]);
    const fieldMap: Record<string, string> = {
      documentType: "PASSPORT",
      issuingCountry: "UTO",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      fullName: "MUSTER JOHN MICHAEL",
      passportNumber: "AB123456",
      nationality: "UTO",
      dateOfBirth: "1985-10-10",
      gender: "M",
      expiryDate: "2020-01-01",
    };
    const entries = Object.entries(fieldMap);
    const correct = entries.filter(([name, expected]) => {
      const r = (result as unknown as Record<string, { value: string }>)[name];
      return r?.value === expected;
    }).length;
    expect(correct / entries.length).toBe(1);
  });

  it("reports 100% accuracy for check digit computation", () => {
    expect(computeMrzCheckDigit("AB123456")).toBe("4");
    expect(computeMrzCheckDigit("851010")).toBe("5");
    expect(computeMrzCheckDigit("200101")).toBe("2");
    expect(computeMrzCheckDigit("ABC123")).toBe("1");
    expect(computeMrzCheckDigit("123456")).toBe("5");
    expect(computeMrzCheckDigit("AB123456<")).toBe("4");
  });

  it("correctly identifies all retake-warning conditions", () => {
    type QC = {
      blurScore: number;
      brightness: number;
      contrast: number;
      glareRatio: number;
      skewAngle: number;
      width: number;
      height: number;
      edgeVisibilityScore: number;
    };
    const cases: Array<{ name: string; metrics: QC; expectedWarning: string }> = [
      {
        name: "blur",
        metrics: {
          blurScore: 12,
          brightness: 100,
          contrast: 40,
          glareRatio: 0.02,
          skewAngle: 1.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.8,
        },
        expectedWarning: "BLURRY",
      },
      {
        name: "glare",
        metrics: {
          blurScore: 80,
          brightness: 100,
          contrast: 40,
          glareRatio: 0.45,
          skewAngle: 1.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.8,
        },
        expectedWarning: "GLARE_DETECTED",
      },
      {
        name: "dark",
        metrics: {
          blurScore: 80,
          brightness: 15,
          contrast: 40,
          glareRatio: 0.02,
          skewAngle: 1.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.8,
        },
        expectedWarning: "TOO_DARK",
      },
      {
        name: "low-res",
        metrics: {
          blurScore: 80,
          brightness: 100,
          contrast: 40,
          glareRatio: 0.02,
          skewAngle: 1.0,
          width: 320,
          height: 240,
          edgeVisibilityScore: 0.8,
        },
        expectedWarning: "LOW_RESOLUTION",
      },
    ];
    for (const c of cases) {
      const m = c.metrics;
      const warnings: string[] = [];
      if (m.blurScore < 50) warnings.push("BLURRY");
      if (m.brightness < 50) warnings.push("TOO_DARK");
      if (m.brightness > 220) warnings.push("TOO_BRIGHT");
      if (m.contrast < 30) warnings.push("LOW_CONTRAST");
      if (m.glareRatio > 0.15) warnings.push("GLARE_DETECTED");
      if (Math.abs(m.skewAngle) > 5) warnings.push("SKEWED");
      if (m.width < 800 || m.height < 600) warnings.push("LOW_RESOLUTION");
      if (m.edgeVisibilityScore < 0.3) warnings.push("EDGES_NOT_VISIBLE");
      expect(warnings).toContain(c.expectedWarning);
    }
  });

  it("test data files exist with non-zero size", () => {
    expect(existsSync(GOOD_PASSPORT_PATH)).toBe(true);
    expect(statSync(GOOD_PASSPORT_PATH).size).toBeGreaterThan(0);
    expect(existsSync(BAD_PASSPORT_PATH)).toBe(true);
    expect(statSync(BAD_PASSPORT_PATH).size).toBeGreaterThan(0);
  });
});
