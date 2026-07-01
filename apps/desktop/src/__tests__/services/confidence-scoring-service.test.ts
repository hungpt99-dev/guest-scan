import { describe, it, expect } from "vitest";
import { createConfidenceScoringService } from "../../services/confidence-scoring-service";
import { createOcrConfidenceService } from "../../services/ocr_confidence_service";
import type { OcrTextResult } from "../../ocr/ocr_engine";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { ImageQualityResult } from "../../services/image_quality_service";

function makeFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "JOHN DOE",
    firstName: "JOHN",
    lastName: "DOE",
    gender: "M",
    dateOfBirth: "1990-01-15",
    nationality: "USA",
    countryCode: "USA",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "2020-06-01",
    expiryDate: "2030-06-01",
    issuingCountry: "USA",
    mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    mrzParsed: ["P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<", "AB1234567<USA9001155M3006017<<<<<<<<"],
    rawOriginal: {
      fullName: "JOHN DOE",
      surname: "DOE",
      givenName: "JOHN",
      gender: "M",
      dateOfBirth: "900115",
      nationality: "USA",
      issuingCountry: "USA",
      documentType: "P",
      passportNumber: "AB1234567",
      documentNumber: "AB1234567",
      idNumber: "",
      issueDate: "",
      expiryDate: "300601",
      mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    },
    ...overrides,
  };
}

function makeOcrResult(overrides: Partial<OcrTextResult> = {}): OcrTextResult {
  return {
    lines: [
      { text: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
      { text: "AB1234567<USA9001155M3006017<<<<<<<<", confidence: 0.92 },
    ],
    fullText: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    averageConfidence: 0.93,
    ...overrides,
  };
}

function makeQualityResult(overrides: Partial<ImageQualityResult> = {}): ImageQualityResult {
  return {
    metrics: {
      blurScore: 85.0,
      brightness: 128.0,
      contrast: 55.0,
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

describe("ConfidenceScoringService", () => {
  const service = createConfidenceScoringService();
  const baseService = createOcrConfidenceService();

  function baseScores(fields: NormalizedFields, ocrResult: OcrTextResult) {
    return baseService.calculateConfidence(fields, ocrResult);
  }

  describe("calculateFieldScores", () => {
    it("returns HIGH confidence for perfect quality with high OCR confidence", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult();
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.fullName.level).toBe("HIGH");
      expect(result.firstName.level).toBe("HIGH");
      expect(result.lastName.level).toBe("HIGH");
      expect(result.gender.level).toBe("HIGH");
      expect(result.dateOfBirth.level).toBe("HIGH");
      expect(result.documentType.level).toBe("HIGH");
      expect(result.passportNumber.level).toBe("HIGH");
      expect(result.nationality.level).toBe("HIGH");
      expect(result.expiryDate.level).toBe("HIGH");
    });

    it("returns unmodified base scores when no quality warnings exist", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult();
      const result = service.calculateFieldScores(fields, ocrResult, quality);
      const base = baseScores(fields, ocrResult);

      expect(result.fullName.score).toBe(base.fullName.score);
      expect(result.dateOfBirth.score).toBe(base.dateOfBirth.score);
    });

    it("applies quality penalty for blurry images", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const base = baseScores(fields, ocrResult);
      const quality = makeQualityResult({
        warnings: ["BLURRY"],
        passed: false,
        metrics: { ...makeQualityResult().metrics, blurScore: 20.0 },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.fullName.score).toBeLessThan(base.fullName.score);
      expect(result.fullName.issues).toContain("Image is blurry");
    });

    it("caps quality penalty at 0.3 for many warnings", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const base = baseScores(fields, ocrResult);
      const quality = makeQualityResult({
        warnings: ["BLURRY", "GLARE_DETECTED", "TOO_DARK", "LOW_CONTRAST", "SKEWED"],
        passed: false,
        metrics: {
          blurScore: 15.0,
          brightness: 30.0,
          contrast: 15.0,
          glareRatio: 0.4,
          skewAngle: 12.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
          overexposureRatio: 0,
          mrzCutoffScore: 1,
          creaseScore: 0,
        },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      const diff = base.fullName.score - result.fullName.score;
      expect(diff).toBeLessThanOrEqual(0.31);
    });

    it("adds field-specific quality issues for MRZ-impacting warnings", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult({
        warnings: ["BLURRY", "LOW_RESOLUTION", "SKEWED"],
        passed: false,
        metrics: {
          blurScore: 20.0,
          brightness: 128.0,
          contrast: 55.0,
          glareRatio: 0.02,
          skewAngle: 12.0,
          width: 600,
          height: 400,
          edgeVisibilityScore: 0.85,
          overexposureRatio: 0,
          mrzCutoffScore: 1,
          creaseScore: 0,
        },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.mrzRaw.issues).toContain("Image is blurry");
      expect(result.mrzRaw.issues).toContain("Document is skewed or rotated");
      expect(result.fullName.issues).toContain("Image is blurry");
    });

    it("adds glare issue to mrzRaw field", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult({
        warnings: ["GLARE_DETECTED"],
        passed: false,
        metrics: { ...makeQualityResult().metrics, glareRatio: 0.35 },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.mrzRaw.issues).toContain("Glare or reflection detected on image");
    });

    it("does not add quality issues to fields unaffected by the warning", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult({
        warnings: ["EDGES_NOT_VISIBLE"],
        passed: false,
        metrics: { ...makeQualityResult().metrics, edgeVisibilityScore: 0.15 },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.fullName.issues).not.toContain("Document edges are not fully visible");
    });

    it("preserves LOW when quality issues compound with low OCR", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult({ averageConfidence: 0.35 });
      const quality = makeQualityResult({
        warnings: ["BLURRY", "GLARE_DETECTED", "TOO_DARK"],
        passed: false,
        metrics: {
          blurScore: 15.0,
          brightness: 25.0,
          contrast: 20.0,
          glareRatio: 0.4,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
          overexposureRatio: 0,
          mrzCutoffScore: 1,
          creaseScore: 0,
        },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      for (const val of Object.values(result)) {
        expect(val.level).toBe("LOW");
      }
    });

    it("merges quality issues with base issues", () => {
      const fields = makeFields({ dateOfBirth: "bad-date" });
      const ocrResult = makeOcrResult({ averageConfidence: 0.5 });
      const quality = makeQualityResult({
        warnings: ["BLURRY", "LOW_CONTRAST"],
        passed: false,
        metrics: {
          blurScore: 20.0,
          brightness: 128.0,
          contrast: 20.0,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
          overexposureRatio: 0,
          mrzCutoffScore: 1,
          creaseScore: 0,
        },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      expect(result.dateOfBirth.issues).toContain("Invalid date format or value");
      expect(result.dateOfBirth.issues).toContain("Image is blurry");
    });

    it("handles all field keys with score, level, and issues", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult({
        warnings: ["BLURRY"],
        passed: false,
        metrics: { ...makeQualityResult().metrics, blurScore: 20.0 },
      });
      const result = service.calculateFieldScores(fields, ocrResult, quality);

      const expectedKeys = [
        "fullName",
        "firstName",
        "lastName",
        "gender",
        "dateOfBirth",
        "nationality",
        "countryCode",
        "documentType",
        "documentNumber",
        "passportNumber",
        "idNumber",
        "issueDate",
        "expiryDate",
        "issuingCountry",
        "mrzRaw",
      ];
      for (const key of expectedKeys) {
        expect(result).toHaveProperty(key);
        const field = result[key as keyof typeof result];
        expect(field).toHaveProperty("score");
        expect(field).toHaveProperty("level");
        expect(field).toHaveProperty("issues");
      }
      expect(Object.keys(result).length).toBe(expectedKeys.length);
    });
  });

  describe("identifyLowConfidenceFields", () => {
    it("returns empty array when all fields are HIGH confidence", () => {
      const fields = makeFields({ idNumber: "ID123456" });
      const ocrResult = makeOcrResult();
      const quality = makeQualityResult();
      const scores = service.calculateFieldScores(fields, ocrResult, quality);
      const low = service.identifyLowConfidenceFields(scores);

      expect(low).toHaveLength(0);
    });

    it("returns fields with MEDIUM or LOW confidence", () => {
      const fields = makeFields({
        dateOfBirth: "bad-date",
        nationality: "INVALID",
      });
      const ocrResult = makeOcrResult({ averageConfidence: 0.5 });
      const quality = makeQualityResult({
        warnings: ["BLURRY"],
        passed: false,
        metrics: { ...makeQualityResult().metrics, blurScore: 20.0 },
      });
      const scores = service.calculateFieldScores(fields, ocrResult, quality);
      const low = service.identifyLowConfidenceFields(scores);

      expect(low.length).toBeGreaterThan(0);
      expect(low).toContain("dateOfBirth");
    });
  });
});
