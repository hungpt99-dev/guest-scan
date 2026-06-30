import { describe, it, expect } from "vitest";
import { createOcrConfidenceService } from "../../services/ocr_confidence_service";
import type { FieldConfidenceScores, FieldConfidenceScore } from "../../services/ocr_confidence_service";
import type { OcrTextResult } from "../../ocr/ocr_engine";
import type { NormalizedFields } from "../../services/field_normalization_service";

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

describe("OcrConfidenceService", () => {
  const service = createOcrConfidenceService();

  describe("calculateConfidence", () => {
    it("returns HIGH confidence for high-quality OCR with valid fields", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

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

    it("scores all fields between 0 and 1", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      for (const [, val] of Object.entries(result)) {
        expect(val.score).toBeGreaterThanOrEqual(0);
        expect(val.score).toBeLessThanOrEqual(1);
      }
    });

    it("marks empty fields with lower confidence", () => {
      const fields = makeFields({ idNumber: "", firstName: "" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.idNumber.issues).toContain("Field is empty");
      expect(result.firstName.issues).toContain("Field is empty");
      expect(result.idNumber.score).toBeLessThan(0.8);
      expect(result.firstName.score).toBeLessThan(0.8);
    });

    it("penalizes invalid date fields", () => {
      const fields = makeFields({ dateOfBirth: "invalid-date" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.dateOfBirth.score).toBeLessThan(0.85);
      expect(result.dateOfBirth.issues).toContain("Invalid date format or value");
    });

    it("penalizes invalid country codes", () => {
      const fields = makeFields({ nationality: "XYZ" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.nationality.score).toBeLessThan(0.8);
      expect(result.nationality.issues).toContain("Invalid country code");
    });

    it("applies check digit bonus when valid", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const checkDigits = {
        passport_number_valid: true,
        date_of_birth_valid: true,
        expiry_date_valid: true,
        optional_data_valid: true,
        final_composite_valid: true,
        overall_valid: true,
      };
      const withCheck = service.calculateConfidence(fields, ocrResult, checkDigits);
      const withoutCheck = service.calculateConfidence(fields, ocrResult);

      expect(withCheck.passportNumber.score).toBeGreaterThan(withoutCheck.passportNumber.score);
      expect(withCheck.dateOfBirth.score).toBeGreaterThan(withoutCheck.dateOfBirth.score);
      expect(withCheck.expiryDate.score).toBeGreaterThan(withoutCheck.expiryDate.score);
    });

    it("penalizes fields with failed check digit validation", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const checkDigits = {
        passport_number_valid: false,
        date_of_birth_valid: false,
        expiry_date_valid: false,
        optional_data_valid: false,
        final_composite_valid: false,
        overall_valid: false,
      };
      const result = service.calculateConfidence(fields, ocrResult, checkDigits);

      expect(result.passportNumber.issues).toContain("MRZ check digit validation failed");
      expect(result.dateOfBirth.issues).toContain("MRZ check digit validation failed");
      expect(result.expiryDate.issues).toContain("MRZ check digit validation failed");
    });

    it("returns LOW confidence when OCR average is very low", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult({
        averageConfidence: 0.3,
        lines: [
          { text: "garbage", confidence: 0.3 },
          { text: "noise", confidence: 0.25 },
        ],
      });
      const result = service.calculateConfidence(fields, ocrResult);

      for (const val of Object.values(result)) {
        expect(val.level).toBe("LOW");
      }
    });

    it("handles gender field correctly", () => {
      const fields = makeFields({ gender: "F" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.gender.score).toBeGreaterThan(0.85);
    });

    it("handles UNKNOWN gender without bonus", () => {
      const fields = makeFields({ gender: "UNKNOWN" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.gender.score).toBeGreaterThan(0);
    });

    it("handles document type validation", () => {
      const fields = makeFields({ documentType: "ID_CARD" });
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.documentType.score).toBeGreaterThan(0.85);
    });

    it("scores mrzRaw based on per-line confidence", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.mrzRaw.score).toBeGreaterThan(0.7);
    });

    it("marks mrzRaw with issues when line confidence is low", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult({
        lines: [
          { text: "garbage", confidence: 0.3 },
          { text: "noise", confidence: 0.25 },
        ],
        averageConfidence: 0.28,
      });
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.mrzRaw.issues).toContain("Low MRZ line confidence");
    });

    it("handles empty MRZ raw text gracefully", () => {
      const fields = makeFields({ mrzRaw: "" });
      const ocrResult = makeOcrResult({ lines: [], fullText: "", averageConfidence: 0 });
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.mrzRaw.score).toBeGreaterThanOrEqual(0);
      expect(result.mrzRaw.score).toBeLessThanOrEqual(1);
    });

    it("provides issues array for each field", () => {
      const fields = makeFields({
        dateOfBirth: "bad-date",
        nationality: "INVALID",
      });
      const ocrResult = makeOcrResult({ averageConfidence: 0.5 });
      const result = service.calculateConfidence(fields, ocrResult);

      expect(result.dateOfBirth.issues.length).toBeGreaterThan(0);
      expect(result.nationality.issues.length).toBeGreaterThan(0);
    });

    it("produces all expected field keys", () => {
      const fields = makeFields();
      const ocrResult = makeOcrResult();
      const result = service.calculateConfidence(fields, ocrResult);

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
        const score: FieldConfidenceScore = result[key as keyof FieldConfidenceScores];
        expect(score).toHaveProperty("score");
        expect(score).toHaveProperty("level");
        expect(score).toHaveProperty("issues");
      }
      expect(Object.keys(result).length).toBe(expectedKeys.length);
    });
  });
});
