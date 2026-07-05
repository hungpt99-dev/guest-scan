import { describe, it, expect } from "vitest";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { FieldConfidenceScores } from "../../services/ocr_confidence_service";

const mockFields: NormalizedFields = {
  fullName: "JOHN DOE",
  firstName: "JOHN",
  lastName: "DOE",
  gender: "M",
  dateOfBirth: "1990-01-15",
  nationality: "GBR",
  countryCode: "GBR",
  documentType: "PASSPORT",
  documentNumber: "AB123456",
  passportNumber: "AB123456",
  idNumber: "",
  issueDate: "2020-01-01",
  expiryDate: "2030-01-01",
  issuingCountry: "GBR",
  mrzRaw: "P<GBRDOE<<JOHN<...",
  mrzParsed: ["P<GBRDOE<<JOHN<..."],
  rawOriginal: {
    fullName: "JOHN DOE",
    surname: "DOE",
    givenName: "JOHN",
    gender: "M",
    dateOfBirth: "1990-01-15",
    nationality: "GBR",
    issuingCountry: "GBR",
    documentType: "PASSPORT",
    passportNumber: "AB123456",
    documentNumber: "AB123456",
    idNumber: "",
    issueDate: "2020-01-01",
    expiryDate: "2030-01-01",
    mrzRaw: "P<GBRDOE<<JOHN<...",
  },
};

type ConfidenceValue = { score: number; level: "HIGH" | "MEDIUM" | "LOW"; issues: string[] };
function makeConfidence(score: number, level: "HIGH" | "MEDIUM" | "LOW"): ConfidenceValue {
  return { score, level, issues: [] };
}

const mockConfidence: FieldConfidenceScores = {
  fullName: makeConfidence(0.95, "HIGH"),
  firstName: makeConfidence(0.95, "HIGH"),
  lastName: makeConfidence(0.95, "HIGH"),
  gender: makeConfidence(0.95, "HIGH"),
  dateOfBirth: makeConfidence(0.95, "HIGH"),
  nationality: makeConfidence(0.95, "HIGH"),
  countryCode: makeConfidence(0.95, "HIGH"),
  documentType: makeConfidence(0.95, "HIGH"),
  documentNumber: makeConfidence(0.95, "HIGH"),
  passportNumber: makeConfidence(0.95, "HIGH"),
  idNumber: makeConfidence(0.95, "HIGH"),
  issueDate: makeConfidence(0.95, "HIGH"),
  expiryDate: makeConfidence(0.95, "HIGH"),
  issuingCountry: makeConfidence(0.95, "HIGH"),
  mrzRaw: makeConfidence(0.9, "HIGH"),
};

describe("ReviewScreen types", () => {
  it("mock fields match NormalizedFields type", () => {
    expect(mockFields.fullName).toBe("JOHN DOE");
    expect(mockFields.documentType).toBe("PASSPORT");
    expect(mockFields.mrzRaw).toBeTruthy();
  });

  it("mock confidence matches FieldConfidenceScores type", () => {
    expect(mockConfidence.fullName.score).toBe(0.95);
    expect(mockConfidence.fullName.level).toBe("HIGH");
    expect(mockConfidence.mrzRaw.score).toBe(0.9);
  });

  it("has all required confidence fields", () => {
    const requiredFields = [
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
    for (const field of requiredFields) {
      expect(mockConfidence).toHaveProperty(field);
    }
  });
});
