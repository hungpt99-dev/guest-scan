import { describe, it, expect } from "vitest";
import { parseMrz, computeCheckDigit, generateRepairCandidates, selectBestCandidate } from "../../services/mrz_parser";

describe("MrzParser", () => {
  describe("computeCheckDigit", () => {
    it("computes check digit for passport number", () => {
      expect(computeCheckDigit("AB123456")).toBe("4");
    });

    it("computes check digit for date of birth", () => {
      expect(computeCheckDigit("851010")).toBe("5");
    });

    it("computes check digit for expiry date", () => {
      expect(computeCheckDigit("200101")).toBe("2");
    });

    it("returns 0 for empty string", () => {
      expect(computeCheckDigit("")).toBe("0");
    });

    it("handles filler characters as zero value", () => {
      expect(computeCheckDigit("<")).toBe("0");
    });
  });

  describe("generateRepairCandidates", () => {
    it("generates candidates for passport number with O→0 confusion", () => {
      const candidates = generateRepairCandidates("AB12345O", "passport_number");
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates).toContain("AB123450");
    });

    it("generates candidates for passport number with I→1 confusion", () => {
      const candidates = generateRepairCandidates("AB12345I", "passport_number");
      expect(candidates).toContain("AB123451");
    });

    it("generates candidates for date with I→1 and O→0 confusion", () => {
      const candidates = generateRepairCandidates("8I1O10", "date");
      expect(candidates).toContain("811010");
      expect(candidates).toContain("8I1010");
    });

    it("generates candidates for country code VNB→VNM", () => {
      const candidates = generateRepairCandidates("VNB", "country");
      expect(candidates).toContain("VNM");
    });

    it("returns empty array when no ambiguous characters present", () => {
      const candidates = generateRepairCandidates("ABCDEFG", "passport_number");
      expect(candidates).toEqual([]);
    });

    it("generates multi-position substitution candidates", () => {
      const candidates = generateRepairCandidates("0I12345", "passport_number");
      expect(candidates.length).toBeGreaterThan(1);
      expect(candidates).toContain("OI12345");
      expect(candidates).toContain("0112345");
    });
  });

  describe("selectBestCandidate", () => {
    it("selects original when check digit matches", () => {
      const result = selectBestCandidate("AB123456", ["AB123450", "AB12345O"], "4", "passport_number");
      expect(result.value).toBe("AB123456");
      expect(result.corrected).toBe(false);
    });

    it("selects candidate matching expected check digit", () => {
      const result = selectBestCandidate("AB12345O", ["AB123456", "AB123450", "AB12345O"], "4", "passport_number");
      expect(result.value).toBe("AB123456");
      expect(result.corrected).toBe(true);
    });

    it("returns original when no candidate matches", () => {
      const result = selectBestCandidate("AB12345O", ["AB123450", "AB12345O"], "9", "passport_number");
      expect(result.value).toBe("AB12345O");
      expect(result.corrected).toBe(false);
    });

    it("returns original when no candidates provided", () => {
      const result = selectBestCandidate("AB123456", [], "4", "passport_number");
      expect(result.value).toBe("AB123456");
      expect(result.corrected).toBe(false);
    });
  });

  describe("parseMrz", () => {
    it("parses TD3 passport MRZ correctly", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.format).toBe("TD3");
      expect(result.documentType.value).toBe("PASSPORT");
      expect(result.issuingCountry.value).toBe("UTO");
      expect(result.surname.value).toBe("MUSTER");
      expect(result.givenName.value).toBe("JOHN MICHAEL");
      expect(result.fullName.value).toBe("MUSTER JOHN MICHAEL");
      expect(result.passportNumber.value).toBe("AB123456");
      expect(result.nationality.value).toBe("UTO");
      expect(result.dateOfBirth.value).toBe("1985-10-10");
      expect(result.gender.value).toBe("M");
      expect(result.expiryDate.value).toBe("2020-01-01");
      expect(result.mrzLines).toEqual([line1, line2]);
    });

    it("parses TD3 with all check digits valid", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.checkDigits.passport_number_valid).toBe(true);
      expect(result.checkDigits.date_of_birth_valid).toBe(true);
      expect(result.checkDigits.expiry_date_valid).toBe(true);
      expect(result.checkDigits.optional_data_valid).toBe(true);
      expect(result.checkDigits.final_composite_valid).toBe(true);
      expect(result.overallValid).toBe(true);
    });

    it("detects invalid passport number check digit", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.checkDigits.passport_number_valid).toBe(false);
      expect(result.overallValid).toBe(false);
    });

    it("repairs O→0 in passport number using check digit", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12O456<5UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.passportNumber.value).toBe("AB120456");
      expect(result.passportNumber.corrected).toBe(true);
      expect(result.corrections.some((c) => c.field === "passportNumber")).toBe(true);
    });

    it("repairs I→1 in passport number using check digit", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12345I<9UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.passportNumber.value).toBe("AB123451");
      expect(result.passportNumber.corrected).toBe(true);
    });

    it("repairs O→0 in date of birth using check digit", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8501O53M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.dateOfBirth.value).toBe("1985-01-05");
      expect(result.dateOfBirth.corrected).toBe(true);
    });

    it("repairs VNB country code to VNM", () => {
      const line1 = "P<VNBMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4VNB8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.issuingCountry.value).toBe("VNM");
      expect(result.nationality.value).toBe("VNM");
    });

    it("handles date field OCR errors with B→8 and O→0 using check digits", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTOB5101O5M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.dateOfBirth.corrected).toBe(true);
      expect(result.dateOfBirth.value).toBe("1985-10-10");
    });

    it("reports corrections metadata", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12345O<4UTO8501O53M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.corrections.length).toBeGreaterThan(0);
      for (const c of result.corrections) {
        expect(c).toHaveProperty("field");
        expect(c).toHaveProperty("from");
        expect(c).toHaveProperty("to");
        expect(c).toHaveProperty("reason");
        expect(c.from).not.toBe(c.to);
      }
    });

    it("parses TD1 format (ID card)", () => {
      const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<";
      const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
      const result = parseMrz([line1, line2, line3]);

      expect(result.format).toBe("TD1");
      expect(result.documentType.value).toBe("ID_CARD");
      expect(result.surname.value).toBe("MUSTER");
      expect(result.givenName.value).toBe("JOHN");
      expect(result.passportNumber.value).toBe("AB123456");
      expect(result.dateOfBirth.value).toBe("1985-10-10");
    });

    it("parses TD2 format", () => {
      const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
      const result = parseMrz([line1, line2]);

      expect(result.format).toBe("TD2");
      expect(result.documentType.value).toBe("ID_CARD");
      expect(result.surname.value).toBe("MUSTER");
      expect(result.passportNumber.value).toBe("AB123456");
      expect(result.dateOfBirth.value).toBe("1985-10-10");
    });

    it("handles fewer than 2 lines gracefully", () => {
      const result = parseMrz(["P<UTOMUSTER<<JOHN"]);

      expect(result.format).toBe("UNKNOWN");
      expect(result.surname.value).toBe("");
      expect(result.mrzLines).toEqual(["P<UTOMUSTER<<JOHN"]);
    });

    it("handles empty lines", () => {
      const result = parseMrz([]);

      expect(result.format).toBe("UNKNOWN");
      expect(result.mrzLines).toEqual([]);
    });

    it("handles century break for dates (70+ -> 1900s)", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO7001019M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.dateOfBirth.value).toBe("1970-01-01");
    });

    it("handles dates with 49 or less as 2000s", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO4901017M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.dateOfBirth.value).toBe("2049-01-01");
    });

    it("handles gender F correctly", () => {
      const line1 = "P<UTOMUSTER<<JANE<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105F2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.gender.value).toBe("F");
    });

    it("handles gender < as UNKNOWN", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105<2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.gender.value).toBe("UNKNOWN");
    });

    it("produces expected field structure", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("documentType");
      expect(result).toHaveProperty("issuingCountry");
      expect(result).toHaveProperty("surname");
      expect(result).toHaveProperty("givenName");
      expect(result).toHaveProperty("fullName");
      expect(result).toHaveProperty("passportNumber");
      expect(result).toHaveProperty("nationality");
      expect(result).toHaveProperty("dateOfBirth");
      expect(result).toHaveProperty("gender");
      expect(result).toHaveProperty("expiryDate");
      expect(result).toHaveProperty("optionalData");
      expect(result).toHaveProperty("checkDigits");
      expect(result).toHaveProperty("overallValid");
      expect(result).toHaveProperty("corrections");
      expect(result).toHaveProperty("mrzLines");
    });

    it("does not correct when correctOcrErrors is false", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12345O<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: false });

      expect(result.passportNumber.value).toBe("AB12345O");
      expect(result.passportNumber.corrected).toBe(false);
      expect(result.corrections.length).toBe(0);
    });

    it("does not validate check digits when validateChecksums is false", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { validateChecksums: false });

      expect(Object.keys(result.checkDigits).length).toBe(0);
    });

    it("applies candidate selection across all fields", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12O456<5UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.passportNumber.value).toBe("AB120456");
      expect(result.passportNumber.corrected).toBe(true);
    });

    it("repairs multiple ambiguous characters in a single field", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12O45O<5UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.passportNumber.value).toBe("AB120456");
      expect(result.passportNumber.corrected).toBe(true);
    });

    it("does not repair passport number when check digit is valid despite ambiguous chars", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB12345O<8UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2], { correctOcrErrors: true, validateChecksums: true });

      expect(result.passportNumber.corrected).toBe(false);
    });

    it("strips filler characters from passport number", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123<456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = parseMrz([line1, line2]);

      expect(result.passportNumber.value).toBe("AB123456");
    });
  });
});
