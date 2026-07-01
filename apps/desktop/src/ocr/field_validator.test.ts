import { describe, it, expect } from "vitest";
import {
  validateField,
  validateExtractedFields,
  needsReview,
  fieldsRequiringReview,
  getOverallConfidence,
  isReadyForAutofill,
} from "./field_validator";

describe("validateField", () => {
  describe("fullName", () => {
    it("accepts a valid name", () => {
      const result = validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER JOHN MICHAEL", 0.95);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    it("flags an empty name as invalid", () => {
      const result = validateField("fullName", "", "", 0.95);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "FIELD_EMPTY" }));
    });

    it("flags a name with invalid characters", () => {
      const result = validateField("fullName", "MUSTER@@JOHN", "MUSTER@@JOHN", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "INVALID_FORMAT" }));
    });

    it("allows names with hyphens and apostrophes", () => {
      const result = validateField("fullName", "O'BRIEN SMITH-JONES", "O'BRIEN SMITH-JONES", 0.95);
      expect(result.valid).toBe(true);
    });

    it("reduces confidence when corrected", () => {
      const uncorrected = validateField("fullName", "MUSTER", "MUSTER", 0.95);
      const corrected = validateField("fullName", "MUSTER", "MUSTER", 0.95, { corrected: true });
      expect(corrected.adjustedConfidence).toBeLessThan(uncorrected.adjustedConfidence);
    });
  });

  describe("passportNumber", () => {
    it("accepts a valid passport number", () => {
      const result = validateField("passportNumber", "AB123456", "AB123456", 0.95);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it("flags an empty passport number", () => {
      const result = validateField("passportNumber", "", "", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "FIELD_EMPTY" }));
    });

    it("flags passport number with ambiguous characters", () => {
      const result = validateField("passportNumber", "AB123O56", "AB123O56", 0.9);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "warning", code: "AMBIGUOUS_CHARS" }));
    });

    it("rejects passport number that is too short", () => {
      const result = validateField("passportNumber", "AB", "AB", 0.95);
      expect(result.valid).toBe(false);
    });
  });

  describe("nationality", () => {
    it("accepts a valid 3-letter country code", () => {
      const result = validateField("nationality", "UTO", "UTO", 0.95);
      expect(result.valid).toBe(true);
    });

    it("accepts common country codes", () => {
      expect(validateField("nationality", "USA", "USA", 0.95).valid).toBe(true);
      expect(validateField("nationality", "GBR", "GBR", 0.95).valid).toBe(true);
      expect(validateField("nationality", "VNM", "VNM", 0.95).valid).toBe(true);
      expect(validateField("nationality", "JPN", "JPN", 0.95).valid).toBe(true);
    });

    it("flags an empty nationality", () => {
      const result = validateField("nationality", "", "", 0.95);
      expect(result.valid).toBe(false);
    });

    it("flags a non-3-letter country code", () => {
      const result = validateField("nationality", "USA1", "USA1", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "INVALID_LENGTH" }));
    });

    it("warns for unrecognized country code", () => {
      const result = validateField("nationality", "XYZ", "XYZ", 0.95);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: "warning", code: "UNRECOGNIZED_COUNTRY" }),
      );
    });
  });

  describe("dateOfBirth", () => {
    it("accepts a valid date of birth", () => {
      const result = validateField("dateOfBirth", "1985-10-10", "851010", 0.95);
      expect(result.valid).toBe(true);
    });

    it("flags an empty date of birth", () => {
      const result = validateField("dateOfBirth", "", "", 0.95);
      expect(result.valid).toBe(false);
    });

    it("flags an invalid date format", () => {
      const result = validateField("dateOfBirth", "85-10-10", "851010", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "INVALID_DATE" }));
    });

    it("flags a future date of birth", () => {
      const result = validateField("dateOfBirth", "2099-01-01", "990101", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "FUTURE_DATE" }));
    });

    it("flags an unrealistically old date", () => {
      const result = validateField("dateOfBirth", "1880-01-01", "800101", 0.95);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "warning", code: "UNUSUALLY_OLD" }));
    });
  });

  describe("expiryDate", () => {
    it("accepts a future expiry date", () => {
      const futureDate = "2030-12-31";
      const result = validateField("expiryDate", futureDate, "301231", 0.95);
      expect(result.valid).toBe(true);
    });

    it("flags an expired date", () => {
      const result = validateField("expiryDate", "2020-01-01", "200101", 0.95);
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "EXPIRED" }));
    });

    it("flags an empty expiry date", () => {
      const result = validateField("expiryDate", "", "", 0.95);
      expect(result.valid).toBe(false);
    });
  });

  describe("gender", () => {
    it("accepts M", () => {
      const result = validateField("gender", "M", "M", 0.95);
      expect(result.valid).toBe(true);
    });

    it("accepts F", () => {
      const result = validateField("gender", "F", "F", 0.95);
      expect(result.valid).toBe(true);
    });

    it("warns for UNKNOWN", () => {
      const result = validateField("gender", "UNKNOWN", "UNKNOWN", 0.95);
      expect(result.issues).toContainEqual(expect.objectContaining({ severity: "warning", code: "GENDER_UNKNOWN" }));
    });

    it("flags invalid gender", () => {
      const result = validateField("gender", "X", "X", 0.95);
      expect(result.valid).toBe(false);
    });
  });

  describe("issuingCountry", () => {
    it("accepts a valid country code", () => {
      const result = validateField("issuingCountry", "UTO", "UTO", 0.95);
      expect(result.valid).toBe(true);
    });

    it("flags an empty issuing country", () => {
      const result = validateField("issuingCountry", "", "", 0.95);
      expect(result.valid).toBe(false);
    });

    it("warns for unrecognized country code", () => {
      const result = validateField("issuingCountry", "ZZZ", "ZZZ", 0.95);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: "warning", code: "UNRECOGNIZED_COUNTRY" }),
      );
    });
  });

  describe("MRZ boost", () => {
    it("boosts confidence when MRZ is valid", () => {
      const withoutMrz = validateField("passportNumber", "AB123456", "AB123456", 0.7, { mrzValid: false });
      const withMrz = validateField("passportNumber", "AB123456", "AB123456", 0.7, { mrzValid: true });
      expect(withMrz.adjustedConfidence).toBeGreaterThan(withoutMrz.adjustedConfidence);
    });

    it("caps confidence at 1.0", () => {
      const result = validateField("passportNumber", "AB123456", "AB123456", 0.9, { mrzValid: true });
      expect(result.adjustedConfidence).toBeLessThanOrEqual(1);
    });
  });
});

describe("validateExtractedFields", () => {
  it("validates all provided fields", () => {
    const results = validateExtractedFields({
      fullName: "MUSTER JOHN MICHAEL",
      passportNumber: "AB123456",
      nationality: "UTO",
      dateOfBirth: "1985-10-10",
      gender: "M",
      expiryDate: "2030-01-01",
      issuingCountry: "UTO",
    });

    expect(results).toHaveLength(7);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("skips empty fields", () => {
    const results = validateExtractedFields({
      fullName: "MUSTER JOHN MICHAEL",
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.fieldName).toBe("fullName");
  });

  it("flags invalid fields", () => {
    const results = validateExtractedFields({
      fullName: "MUSTER JOHN MICHAEL",
      passportNumber: "",
      expiryDate: "2020-01-01",
    });

    expect(results).toHaveLength(2);
    const passportResult = results.find((r) => r.fieldName === "passportNumber");
    expect(passportResult).toBeUndefined();
    const expiryResult = results.find((r) => r.fieldName === "expiryDate");
    expect(expiryResult?.valid).toBe(false);
    expect(expiryResult?.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "EXPIRED" }));
  });

  it("applies MRZ boost when mrzValid is true", () => {
    const withoutMrz = validateExtractedFields({ passportNumber: "AB123456" }, { mrzValid: false });
    const withMrz = validateExtractedFields({ passportNumber: "AB123456" }, { mrzValid: true });
    expect(withMrz[0]!.adjustedConfidence).toBeGreaterThan(withoutMrz[0]!.adjustedConfidence);
  });
});

describe("needsReview", () => {
  it("returns false when all fields are valid", () => {
    const results = [
      validateField("fullName", "MUSTER", "MUSTER", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
    ];
    expect(needsReview(results)).toBe(false);
  });

  it("returns true when any field needs review", () => {
    const results = [validateField("fullName", "MUSTER", "MUSTER", 0.95), validateField("passportNumber", "", "", 0)];
    expect(needsReview(results)).toBe(true);
  });
});

describe("fieldsRequiringReview", () => {
  it("returns only fields that need review", () => {
    const results = [validateField("fullName", "MUSTER", "MUSTER", 0.95), validateField("passportNumber", "", "", 0)];
    const reviewFields = fieldsRequiringReview(results);
    expect(reviewFields).toHaveLength(1);
    expect(reviewFields[0]!.fieldName).toBe("passportNumber");
  });
});

describe("getOverallConfidence", () => {
  it("returns average of adjusted confidences", () => {
    const results = [
      validateField("fullName", "MUSTER", "MUSTER", 0.9),
      validateField("passportNumber", "AB123456", "AB123456", 0.8),
    ];
    const avg = getOverallConfidence(results);
    expect(avg).toBeGreaterThan(0.8);
    expect(avg).toBeLessThan(0.9);
  });

  it("returns 0 for empty results", () => {
    expect(getOverallConfidence([])).toBe(0);
  });
});

describe("isReadyForAutofill", () => {
  it("returns true when all required fields are valid", () => {
    const results = [
      validateField("fullName", "MUSTER", "MUSTER", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
      validateField("dateOfBirth", "1985-10-10", "851010", 0.95),
      validateField("expiryDate", "2030-01-01", "300101", 0.95),
      validateField("nationality", "UTO", "UTO", 0.95),
      validateField("gender", "M", "M", 0.95),
    ];
    expect(isReadyForAutofill(results)).toBe(true);
  });

  it("returns false when a required field is missing from results", () => {
    const results = [validateField("fullName", "MUSTER", "MUSTER", 0.95)];
    expect(isReadyForAutofill(results)).toBe(false);
  });

  it("returns false when a required field is not valid", () => {
    const results = [
      validateField("fullName", "MUSTER", "MUSTER", 0.95),
      validateField("passportNumber", "AB123456", "AB123456", 0.95),
      validateField("dateOfBirth", "", "", 0),
      validateField("expiryDate", "2030-01-01", "300101", 0.95),
      validateField("nationality", "UTO", "UTO", 0.95),
      validateField("gender", "M", "M", 0.95),
    ];
    expect(isReadyForAutofill(results)).toBe(false);
  });

  it("accepts custom required fields list", () => {
    const results = [validateField("fullName", "MUSTER", "MUSTER", 0.95)];
    expect(isReadyForAutofill(results, ["fullName"])).toBe(true);
  });
});
