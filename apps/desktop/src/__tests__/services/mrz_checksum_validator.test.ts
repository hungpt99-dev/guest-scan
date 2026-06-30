import { describe, it, expect } from "vitest";
import { createMrzChecksumValidator } from "../../services/mrz_checksum_validator";

describe("MrzChecksumValidator", () => {
  const validator = createMrzChecksumValidator();

  describe("validateChecksums", () => {
    it("validates TD3 MRZ with valid checksums", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result.passportNumberValid).toBe(true);
      expect(result.dateOfBirthValid).toBe(true);
      expect(result.expiryDateValid).toBe(true);
      expect(result.optionalDataValid).toBe(true);
      expect(result.finalCompositeValid).toBe(true);
      expect(result.overallValid).toBe(true);
    });

    it("detects invalid passport number checksum", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result.passportNumberValid).toBe(false);
      expect(result.overallValid).toBe(false);
      expect(result.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");
    });

    it("detects invalid date of birth checksum", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO85101XM2001012<<<<<<<<<<<<<<<<0<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result.dateOfBirthValid).toBe(false);
      expect(result.errors).toContain("DOB_CHECK_FAILED");
    });

    it("validates TD1 format checksums", () => {
      const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<";
      const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
      const result = validator.validateChecksums([line1, line2, line3]);

      expect(result.passportNumberValid).toBe(true);
      expect(result.dateOfBirthValid).toBe(true);
      expect(result.expiryDateValid).toBe(true);
    });

    it("validates TD2 format checksums", () => {
      const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result.passportNumberValid).toBe(true);
      expect(result.dateOfBirthValid).toBe(true);
      expect(result.expiryDateValid).toBe(true);
    });

    it("returns errors for insufficient lines", () => {
      const result = validator.validateChecksums(["P<UTO"]);

      expect(result.overallValid).toBe(false);
      expect(result.errors).toContain("INSUFFICIENT_LINES");
    });

    it("returns errors for empty input", () => {
      const result = validator.validateChecksums([]);

      expect(result.overallValid).toBe(false);
      expect(result.errors).toContain("INSUFFICIENT_LINES");
    });

    it("returns errors for unknown format", () => {
      const result = validator.validateChecksums(["short", "lines"]);

      expect(result.overallValid).toBe(false);
      expect(result.errors).toContain("UNKNOWN_FORMAT");
    });

    it("treats filler character as valid check digit", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result.optionalDataValid).toBe(true);
    });

    it("produces expected validation result structure", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = validator.validateChecksums([line1, line2]);

      expect(result).toHaveProperty("passportNumberValid");
      expect(result).toHaveProperty("dateOfBirthValid");
      expect(result).toHaveProperty("expiryDateValid");
      expect(result).toHaveProperty("optionalDataValid");
      expect(result).toHaveProperty("finalCompositeValid");
      expect(result).toHaveProperty("overallValid");
      expect(result).toHaveProperty("errors");
    });
  });
});
