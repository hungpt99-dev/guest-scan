import { describe, it, expect } from "vitest";
import { MockOcrEngine } from "../../ocr/mock_ocr_engine";
import { createMrzParserService } from "../../services/mrz_parser_service";
import { createMrzChecksumValidator } from "../../services/mrz_checksum_validator";
import { createFieldNormalizationService } from "../../services/field_normalization_service";
import { createOcrConfidenceService } from "../../services/ocr_confidence_service";
import { createConfidenceScoringService } from "../../services/confidence-scoring-service";
import type { OcrTextResult } from "../../ocr/ocr_engine";
import type { ImageQualityResult } from "../../services/image_quality_service";

function makeGoodOcrResult(overrides: Partial<OcrTextResult> = {}): OcrTextResult {
  return {
    lines: [
      { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
      { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
    ],
    fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    averageConfidence: 0.94,
    ...overrides,
  };
}

function makeQualityResult(overrides: Partial<ImageQualityResult> = {}): ImageQualityResult {
  return {
    metrics: {
      blurScore: 85,
      brightness: 128,
      contrast: 55,
      glareRatio: 0.02,
      skewAngle: 1.5,
      width: 1200,
      height: 900,
      edgeVisibilityScore: 0.85,
      overexposureRatio: 0,
      mrzCutoffScore: 1,
      creaseScore: 0,
    },
    warnings: [],
    ocrWarnings: [],
    passed: true,
    status: "PASSED",
    ...overrides,
  };
}

describe("OCR Engine Abstraction", () => {
  it("MockOcrEngine returns default MRZ data", async () => {
    const engine = new MockOcrEngine();
    const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.text).toContain("P<UTO");
    expect(result.lines[1]!.text).toContain("AB123456");
    expect(result.averageConfidence).toBeCloseTo(0.94);
  });

  it("MockOcrEngine uses custom config when provided", async () => {
    const engine = new MockOcrEngine({
      lines: [{ text: "TEST LINE", confidence: 0.8 }],
      fullText: "TEST LINE",
      averageConfidence: 0.8,
    });
    const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.text).toBe("TEST LINE");
    expect(result.averageConfidence).toBe(0.8);
  });

  it("MockOcrEngine simulates failure when configured", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText({ imagePath: "/tmp/test.jpg" })).rejects.toThrow(
      "Mock OCR engine simulated failure",
    );
  });

  it("MockOcrEngine setConfig updates behavior at runtime", async () => {
    const engine = new MockOcrEngine();
    engine.setConfig({ failWithError: true });
    await expect(engine.extractText({ imagePath: "/tmp/test.jpg" })).rejects.toThrow();
    engine.setConfig({});
    const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });
    expect(result.averageConfidence).toBeGreaterThan(0);
  });
});

describe("MRZ Parsing - All Formats", () => {
  const parser = createMrzParserService();

  it("parses TD3 passport MRZ with full field extraction", () => {
    const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.documentType).toBe("PASSPORT");
    expect(result.issuingCountry).toBe("UTO");
    expect(result.surname).toBe("MUSTER");
    expect(result.givenName).toBe("JOHN MICHAEL");
    expect(result.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(result.passportNumber).toBe("AB123456");
    expect(result.nationality).toBe("UTO");
    expect(result.dateOfBirth).toBe("1985-10-10");
    expect(result.gender).toBe("M");
    expect(result.expiryDate).toBe("2020-01-01");
    expect(result.optionalData).toBe("");
    expect(result.checkDigits.overall_valid).toBe(true);
    expect(result.mrzLines).toEqual([line1, line2]);
  });

  it("parses TD1 format (ID card) with 3 lines", () => {
    const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<";
    const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
    const result = parser.parseMrzLines([line1, line2, line3]);
    expect(result.documentType).toBe("ID_CARD");
    expect(result.surname).toBe("MUSTER");
    expect(result.givenName).toBe("JOHN");
    expect(result.fullName).toBe("MUSTER JOHN");
    expect(result.passportNumber).toBe("AB123456");
    expect(result.dateOfBirth).toBe("1985-10-10");
    expect(result.gender).toBe("M");
    expect(result.checkDigits.overall_valid).toBe(true);
  });

  it("parses TD2 format with 2 lines (medium length)", () => {
    const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.documentType).toBe("ID_CARD");
    expect(result.surname).toBe("MUSTER");
    expect(result.passportNumber).toBe("AB123456");
    expect(result.dateOfBirth).toBe("1985-10-10");
    expect(result.nationality).toBe("UTO");
    expect(result.gender).toBe("M");
  });

  it("handles fewer than 2 lines gracefully", () => {
    const result = parser.parseMrzLines(["P<UTOMUSTER<<JOHN"]);
    expect(result.surname).toBe("");
    expect(result.fullName).toBe("");
    expect(result.documentType).toBe("PASSPORT");
    expect(result.mrzLines).toEqual(["P<UTOMUSTER<<JOHN"]);
  });

  it("handles empty input array", () => {
    const result = parser.parseMrzLines([]);
    expect(result.mrzLines).toEqual([]);
    expect(result.surname).toBe("");
  });

  it("handles unknown format with very short lines", () => {
    const result = parser.parseMrzLines(["SHORT", "LINES"]);
    expect(result.surname).toBe("");
    expect(result.mrzLines).toEqual(["SHORT", "LINES"]);
  });

  it("strips filler characters from passport number", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123<456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.passportNumber).toBe("AB123456");
  });

  it("handles date century overflow (70+ -> 1900s)", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO7001019M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.dateOfBirth).toBe("1970-01-01");
  });

  it("handles dates with 49 or less as 2000s", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO4901017M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.dateOfBirth).toBe("2049-01-01");
  });

  it("returns UNKNOWN gender for invalid gender character", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105X2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.gender).toBe("UNKNOWN");
  });

  it("returns empty date for invalid date in MRZ", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO9913015M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.dateOfBirth).toBe("");
  });

  it("extracts optional data from TD3 MRZ", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.optionalData).toBe("");
  });

  it("handles name field with multiple given names", () => {
    const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<ROBERT<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.surname).toBe("MUSTER");
    expect(result.givenName).toBe("JOHN MICHAEL ROBERT");
    expect(result.fullName).toBe("MUSTER JOHN MICHAEL ROBERT");
  });

  it("handles single given name without filler", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105F2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.gender).toBe("F");
    expect(result.surname).toBe("MUSTER");
    expect(result.givenName).toBe("JOHN");
  });

  it("treats ID card format when line starts with I<", () => {
    const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105F2001012<<<<";
    const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
    const result = parser.parseMrzLines([line1, line2, line3]);
    expect(result.documentType).toBe("ID_CARD");
  });

  it("treats as PASSPORT when line starts with P<", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.documentType).toBe("PASSPORT");
  });

  it("strips whitespace from MRZ lines before parsing", () => {
    const line1 = "  P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<  ";
    const line2 = "  AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<  ";
    const result = parser.parseMrzLines([line1, line2]);
    expect(result.passportNumber).toBe("AB123456");
    expect(result.dateOfBirth).toBe("1985-10-10");
  });
});

describe("MRZ Checksum Validation", () => {
  const validator = createMrzChecksumValidator();

  it("validates TD3 MRZ with all valid checksums", () => {
    const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = validator.validateChecksums([line1, line2]);
    expect(result.passportNumberValid).toBe(true);
    expect(result.dateOfBirthValid).toBe(true);
    expect(result.expiryDateValid).toBe(true);
    expect(result.optionalDataValid).toBe(true);
    expect(result.finalCompositeValid).toBe(true);
    expect(result.overallValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("detects all individual check digit failures", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<XUTO85101YM200101Z<<<<<<<<<<<<<<<<0<<";
    const result = validator.validateChecksums([line1, line2]);
    expect(result.passportNumberValid).toBe(false);
    expect(result.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");
  });

  it("validates TD1 composite check digit", () => {
    const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<";
    const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
    const result = validator.validateChecksums([line1, line2, line3]);
    expect(result.passportNumberValid).toBe(true);
    expect(result.dateOfBirthValid).toBe(true);
    expect(result.expiryDateValid).toBe(true);
    expect(result.overallValid).toBe(true);
  });

  it("validates TD2 format checksums", () => {
    const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
    const result = validator.validateChecksums([line1, line2]);
    expect(result.passportNumberValid).toBe(true);
    expect(result.dateOfBirthValid).toBe(true);
    expect(result.expiryDateValid).toBe(true);
    expect(result.overallValid).toBe(true);
  });

  it("returns INSUFFICIENT_LINES for fewer than 2 lines", () => {
    const result = validator.validateChecksums(["P<UTO"]);
    expect(result.overallValid).toBe(false);
    expect(result.errors).toContain("INSUFFICIENT_LINES");
  });

  it("returns INSUFFICIENT_LINES for empty input", () => {
    const result = validator.validateChecksums([]);
    expect(result.overallValid).toBe(false);
    expect(result.errors).toContain("INSUFFICIENT_LINES");
  });

  it("returns UNKNOWN_FORMAT for very short lines", () => {
    const result = validator.validateChecksums(["short", "lines"]);
    expect(result.overallValid).toBe(false);
    expect(result.errors).toContain("UNKNOWN_FORMAT");
  });

  it("treats filler character < as valid check digit", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = validator.validateChecksums([line1, line2]);
    expect(result.optionalDataValid).toBe(true);
  });

  it("fails composite check when line2[43] is invalid", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<9";
    const result = validator.validateChecksums([line1, line2]);
    expect(result.errors).toContain("FINAL_COMPOSITE_CHECK_FAILED");
  });

  it("validates TD1 with filler composite check digit (passes)", () => {
    const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<";
    const line3 = "<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const result = validator.validateChecksums([line1, line2, line3]);
    expect(result.overallValid).toBe(true);
  });
});

describe("Field Normalization", () => {
  const normalizer = createFieldNormalizationService();

  it("normalizes all TD3 fields correctly", () => {
    const parsedFields = {
      fullName: "MUSTER JOHN MICHAEL",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      gender: "M",
      dateOfBirth: "1985-10-10",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "PASSPORT",
      passportNumber: "AB123456",
      documentNumber: "AB123456",
      idNumber: "",
      issueDate: "",
      expiryDate: "2020-01-01",
      mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
      mrzParsed: [
        "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
        "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
      ],
      checkDigits: { overall_valid: true },
    };
    const result = normalizer.normalizeFields(parsedFields);
    expect(result.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(result.firstName).toBe("JOHN MICHAEL");
    expect(result.lastName).toBe("MUSTER");
    expect(result.gender).toBe("M");
    expect(result.dateOfBirth).toBe("1985-10-10");
    expect(result.expiryDate).toBe("2020-01-01");
    expect(result.documentType).toBe("PASSPORT");
    expect(result.passportNumber).toBe("AB123456");
    expect(result.documentNumber).toBe("AB123456");
    expect(result.idNumber).toBe("AB123456");
    expect(result.rawOriginal).toBeDefined();
    expect(result.rawOriginal.fullName).toBe("MUSTER JOHN MICHAEL");
  });

  it("normalizes gender M, F, X, and UNKNOWN", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      dateOfBirth: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    expect(normalizer.normalizeFields({ ...base, gender: "M" }).gender).toBe("M");
    expect(normalizer.normalizeFields({ ...base, gender: "F" }).gender).toBe("F");
    expect(normalizer.normalizeFields({ ...base, gender: "X" }).gender).toBe("X");
    expect(normalizer.normalizeFields({ ...base, gender: "MALE" }).gender).toBe("M");
    expect(normalizer.normalizeFields({ ...base, gender: "FEMALE" }).gender).toBe("F");
    expect(normalizer.normalizeFields({ ...base, gender: "UNKNOWN" }).gender).toBe("UNKNOWN");
    expect(normalizer.normalizeFields({ ...base, gender: "" }).gender).toBe("UNKNOWN");
  });

  it("normalizes document type variants", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      dateOfBirth: "",
      nationality: "",
      issuingCountry: "",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    expect(normalizer.normalizeFields({ ...base, documentType: "P" }).documentType).toBe("PASSPORT");
    expect(normalizer.normalizeFields({ ...base, documentType: "PN" }).documentType).toBe("PASSPORT");
    expect(normalizer.normalizeFields({ ...base, documentType: "PD" }).documentType).toBe("PASSPORT");
    expect(normalizer.normalizeFields({ ...base, documentType: "I" }).documentType).toBe("ID_CARD");
    expect(normalizer.normalizeFields({ ...base, documentType: "ID" }).documentType).toBe("ID_CARD");
    expect(normalizer.normalizeFields({ ...base, documentType: "IDENTITY" }).documentType).toBe("ID_CARD");
    expect(normalizer.normalizeFields({ ...base, documentType: "" }).documentType).toBe("UNKNOWN");
  });

  it("normalizes 2-letter country codes to 3-letter ISO codes", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      dateOfBirth: "",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    const result = normalizer.normalizeFields({
      ...base,
      nationality: "VN",
      issuingCountry: "VN",
    });
    expect(result.nationality).toBe("VNM");
    expect(result.issuingCountry).toBe("VNM");
  });

  it("passes through 3-letter country codes unchanged", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      dateOfBirth: "",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    const result = normalizer.normalizeFields({
      ...base,
      nationality: "GBR",
      issuingCountry: "VNM",
    });
    expect(result.nationality).toBe("GBR");
    expect(result.issuingCountry).toBe("VNM");
  });

  it("normalizes dates from various formats", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      nationality: "",
      issuingCountry: "",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    const result = normalizer.normalizeFields({
      ...base,
      dateOfBirth: "900115",
      expiryDate: "300601",
    });
    expect(result.dateOfBirth).toBe("1990-01-15");
    expect(result.expiryDate).toBe("2030-06-01");
  });

  it("normalizes 4-digit year dates from various formats", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      nationality: "",
      issuingCountry: "",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    const result = normalizer.normalizeFields({
      ...base,
      dateOfBirth: "1990-01-15",
      expiryDate: "1990/01/15",
    });
    expect(result.dateOfBirth).toBe("1990-01-15");
    expect(result.expiryDate).toBe("1990-01-15");
  });

  it("cleans filler characters from document numbers", () => {
    const base = {
      fullName: "",
      surname: "",
      givenName: "",
      gender: "UNKNOWN",
      dateOfBirth: "",
      nationality: "",
      issuingCountry: "",
      documentType: "PASSPORT",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    };
    const result = normalizer.normalizeFields({
      ...base,
      passportNumber: "AB123<456",
      documentNumber: "AB123<456",
    });
    expect(result.passportNumber).toBe("AB123456");
    expect(result.documentNumber).toBe("AB123456");
  });
});

describe("Confidence Scoring", () => {
  const confidenceService = createOcrConfidenceService();
  const scoringService = createConfidenceScoringService(confidenceService);

  const makeNormalizedFields = () => ({
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M" as const,
    dateOfBirth: "1985-10-10",
    nationality: "USA",
    countryCode: "USA",
    documentType: "PASSPORT" as const,
    documentNumber: "AB123456",
    passportNumber: "AB123456",
    idNumber: "AB123456",
    issueDate: "2020-06-01",
    expiryDate: "2020-01-01",
    issuingCountry: "USA",
    mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    mrzParsed: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<"],
    rawOriginal: {
      fullName: "MUSTER JOHN MICHAEL",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      gender: "M",
      dateOfBirth: "851010",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "P",
      passportNumber: "AB123456",
      documentNumber: "AB123456",
      idNumber: "",
      issueDate: "",
      expiryDate: "200101",
      mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    },
  });

  it("returns HIGH confidence for perfect quality and valid data", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult();
    const qualityResult = makeQualityResult();
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult, {
      overall_valid: true,
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
    });
    expect(scores.fullName.level).toBe("HIGH");
    expect(scores.passportNumber.level).toBe("HIGH");
    expect(scores.dateOfBirth.level).toBe("HIGH");
    expect(scores.gender.level).toBe("HIGH");
    expect(scores.expiryDate.level).toBe("HIGH");
  });

  it("applies quality penalties when warnings are present", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult();
    const qualityResult = makeQualityResult({
      warnings: ["BLURRY", "GLARE_DETECTED"],
      passed: false,
    });
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult, {
      overall_valid: true,
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
    });
    const blurryIssue = scores.fullName.issues.find((i) => i.includes("blurry") || i.includes("Blurry"));
    expect(blurryIssue).toBeDefined();
    const glareIssue = scores.mrzRaw.issues.find((i) => i.includes("Glare") || i.includes("glare"));
    expect(glareIssue).toBeDefined();
  });

  it("caps quality penalty at 0.3", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult();
    const qualityResult = makeQualityResult({
      warnings: ["BLURRY", "GLARE_DETECTED", "LOW_RESOLUTION", "SKEWED"],
      passed: false,
    });
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult);
    const totalQualityPenalty = 0.15 + 0.15 + 0.12 + 0.08;
    expect(totalQualityPenalty).toBeGreaterThan(0.3);
    const baseScore = 0.2 + 0.94 * 0.8;
    const expectedAdjusted = Math.max(0, Math.min(1, baseScore - 0.3));
    expect(scores.fullName.score).toBeCloseTo(expectedAdjusted, 2);
  });

  it("identifies low confidence fields correctly", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult({
      lines: [
        { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.4 },
        { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.3 },
      ],
      averageConfidence: 0.35,
    });
    const qualityResult = makeQualityResult();
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult);
    const lowFields = scoringService.identifyLowConfidenceFields(scores);
    expect(lowFields.length).toBeGreaterThan(0);
  });

  it("returns empty low-confidence list when all scores are HIGH", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult();
    const qualityResult = makeQualityResult();
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult, {
      overall_valid: true,
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
    });
    const lowFields = scoringService.identifyLowConfidenceFields(scores);
    expect(lowFields).toEqual([]);
  });

  it("adds check digit failure issues when check digits are invalid", () => {
    const fields = makeNormalizedFields();
    const ocrResult = makeGoodOcrResult();
    const qualityResult = makeQualityResult();
    const scores = scoringService.calculateFieldScores(fields, ocrResult, qualityResult, {
      overall_valid: false,
      passport_number_valid: false,
      date_of_birth_valid: true,
      expiry_date_valid: true,
    });
    const hasCheckIssue = scores.passportNumber.issues.some(
      (i) => i.includes("check digit") || i.includes("validation failed"),
    );
    expect(hasCheckIssue).toBe(true);
  });
});

describe("Full OCR Flow Integration", () => {
  const parser = createMrzParserService();
  const validator = createMrzChecksumValidator();
  const normalizer = createFieldNormalizationService();

  it("processes MRZ through parse -> validate -> normalize pipeline", () => {
    const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const parsed = parser.parseMrzLines([line1, line2]);
    expect(parsed.documentType).toBe("PASSPORT");
    const validated = validator.validateChecksums([line1, line2]);
    expect(validated.overallValid).toBe(true);
    const normalized = normalizer.normalizeFields({
      ...parsed,
      idNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      issueDate: "",
      mrzRaw: [line1, line2].join("\n"),
      mrzParsed: [line1, line2],
      checkDigits: {
        passport_number_valid: validated.passportNumberValid,
        date_of_birth_valid: validated.dateOfBirthValid,
        expiry_date_valid: validated.expiryDateValid,
        overall_valid: validated.overallValid,
      },
    });
    expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(normalized.passportNumber).toBe("AB123456");
    expect(normalized.dateOfBirth).toBe("1985-10-10");
    expect(normalized.gender).toBe("M");
    expect(normalized.documentType).toBe("PASSPORT");
    expect(normalized.expiryDate).toBe("2020-01-01");
  });

  it("produces same results from MockOcrEngine output through pipeline", async () => {
    const engine = new MockOcrEngine();
    const ocrResult = await engine.extractText({ imagePath: "/tmp/test.jpg" });
    const lines = ocrResult.lines.map((l) => l.text);
    const parsed = parser.parseMrzLines(lines);
    const validated = validator.validateChecksums(lines);
    const normalized = normalizer.normalizeFields({
      ...parsed,
      idNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      issueDate: "",
      mrzRaw: ocrResult.fullText,
      mrzParsed: lines,
      checkDigits: {
        passport_number_valid: validated.passportNumberValid,
        date_of_birth_valid: validated.dateOfBirthValid,
        expiry_date_valid: validated.expiryDateValid,
        overall_valid: validated.overallValid,
      },
    });
    expect(parsed.passportNumber).toBe("AB123456");
    expect(normalized.passportNumber).toBe("AB123456");
    expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(parsed.checkDigits.overall_valid).toBe(false);
  });

  it("detects invalid MRZ and surfaces in checksum validation", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const parsed = parser.parseMrzLines([line1, line2]);
    expect(parsed.checkDigits.passport_number_valid).toBe(false);
    expect(parsed.checkDigits.overall_valid).toBe(false);
    const validated = validator.validateChecksums([line1, line2]);
    expect(validated.passportNumberValid).toBe(false);
    expect(validated.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");
  });

  it("handles expired document date (past expiry)", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const parsed = parser.parseMrzLines([line1, line2]);
    expect(parsed.expiryDate).toBe("2020-01-01");
    const expiryYear = parseInt(parsed.expiryDate.slice(0, 4), 10);
    expect(expiryYear).toBeLessThan(new Date().getFullYear());
  });
});
