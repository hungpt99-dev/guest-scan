import { describe, it, expect, vi, afterEach } from "vitest";
import { detectWarnings } from "../../ocr/utils/warnings";
import type { ExtractedFields } from "@guestfill/shared";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeField(value: string, confidence: number) {
  return { value, confidence };
}

describe("detectWarnings", () => {
  it("returns empty for clean result", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
      dateOfBirth: makeField("1990-01-15", 0.98),
      nationality: makeField("USA", 0.95),
      documentType: makeField("PASSPORT", 0.99),
    };
    const warnings = detectWarnings(fields, 0.95);
    expect(warnings).toEqual([]);
  });

  it("detects LOW_CONFIDENCE_FIELD when overall confidence is low", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
    };
    const warnings = detectWarnings(fields, 0.3);
    expect(warnings).toContain("LOW_CONFIDENCE_FIELD");
  });

  it("detects LOW_CONFIDENCE_FIELD when a field confidence is low", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
      passportNumber: makeField("AB123456", 0.2),
    };
    const warnings = detectWarnings(fields, 0.95);
    expect(warnings).toContain("LOW_CONFIDENCE_FIELD");
  });

  it("detects DOCUMENT_EXPIRED when expiry date is in the past", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
      dateOfBirth: makeField("1990-01-15", 0.98),
      nationality: makeField("USA", 0.95),
      documentType: makeField("PASSPORT", 0.99),
      expiryDate: makeField("2020-01-01", 0.99),
    };
    const warnings = detectWarnings(fields, 0.95);
    expect(warnings).toContain("DOCUMENT_EXPIRED");
  });

  it("detects MISSING_REQUIRED_FIELD when required field missing", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
      dateOfBirth: makeField("1990-01-15", 0.98),
      nationality: makeField("USA", 0.95),
    };
    const warnings = detectWarnings(fields, 0.95);
    expect(warnings).toContain("MISSING_REQUIRED_FIELD");
  });

  it("detects multiple warning types simultaneously", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
      dateOfBirth: makeField("1990-01-15", 0.98),
      expiryDate: makeField("2020-01-01", 0.99),
    };
    const warnings = detectWarnings(fields, 0.3);
    expect(warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(warnings).toContain("DOCUMENT_EXPIRED");
    expect(warnings).toContain("MISSING_REQUIRED_FIELD");
  });

  it("does not duplicate LOW_CONFIDENCE_FIELD when both overall and field are low", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.2),
    };
    const warnings = detectWarnings(fields, 0.3);
    expect(warnings.filter((w) => w === "LOW_CONFIDENCE_FIELD")).toHaveLength(1);
  });

  it("does not duplicate MISSING_REQUIRED_FIELD when multiple fields missing", () => {
    const fields: ExtractedFields = {};
    const warnings = detectWarnings(fields, 0.95);
    expect(warnings.filter((w) => w === "MISSING_REQUIRED_FIELD")).toHaveLength(1);
  });

  it("uses custom lowConfidenceThreshold", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.5),
    };
    const warnings = detectWarnings(fields, 0.7, { lowConfidenceThreshold: 0.6 });
    expect(warnings).toContain("LOW_CONFIDENCE_FIELD");
  });

  it("uses custom requiredFields", () => {
    const fields: ExtractedFields = {
      fullName: makeField("John Doe", 0.95),
    };
    const warnings = detectWarnings(fields, 0.95, {
      requiredFields: ["fullName", "passportNumber"],
    });
    expect(warnings).toContain("MISSING_REQUIRED_FIELD");
  });

  it("does not warn about MISSING_REQUIRED_FIELD when custom requiredFields are all present", () => {
    const fields: ExtractedFields = {
      passportNumber: makeField("AB123456", 0.99),
    };
    const warnings = detectWarnings(fields, 0.95, {
      requiredFields: ["passportNumber"],
    });
    expect(warnings).not.toContain("MISSING_REQUIRED_FIELD");
  });
});
