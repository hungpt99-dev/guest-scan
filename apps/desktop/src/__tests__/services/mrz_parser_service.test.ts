import { describe, it, expect } from "vitest";
import { createMrzParserService } from "../../services/mrz_parser_service";

describe("MrzParserService", () => {
  const service = createMrzParserService();

  describe("parseMrzLines", () => {
    it("parses TD3 passport MRZ correctly", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

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
      expect(result.mrzLines).toEqual([line1, line2]);
    });

    it("parses TD3 with valid check digits", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.checkDigits.passport_number_valid).toBe(true);
      expect(result.checkDigits.date_of_birth_valid).toBe(true);
      expect(result.checkDigits.expiry_date_valid).toBe(true);
      expect(result.checkDigits.overall_valid).toBe(true);
    });

    it("detects invalid check digits", () => {
      const line1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.checkDigits.passport_number_valid).toBe(false);
    });

    it("parses TD1 format (ID card)", () => {
      const line1 = "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<";
      const line3 = "1234567890<<<<<<<<<<<<<<<<<<<<<<<";
      const result = service.parseMrzLines([line1, line2, line3]);

      expect(result.documentType).toBe("ID_CARD");
      expect(result.surname).toBe("MUSTER");
      expect(result.givenName).toBe("JOHN");
      expect(result.passportNumber).toBe("AB123456");
      expect(result.dateOfBirth).toBe("1985-10-10");
    });

    it("parses TD2 format", () => {
      const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.documentType).toBe("ID_CARD");
      expect(result.surname).toBe("MUSTER");
      expect(result.passportNumber).toBe("AB123456");
      expect(result.dateOfBirth).toBe("1985-10-10");
    });

    it("handles fewer than 2 lines gracefully", () => {
      const result = service.parseMrzLines(["P<UTOMUSTER<<JOHN"]);

      expect(result.surname).toBe("");
      expect(result.mrzLines).toEqual(["P<UTOMUSTER<<JOHN"]);
    });

    it("handles empty lines", () => {
      const result = service.parseMrzLines([]);

      expect(result.mrzLines).toEqual([]);
      expect(result.surname).toBe("");
    });

    it("strips filler characters from passport number", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123<456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.passportNumber).toBe("AB123456");
    });

    it("normalizes date of birth from YYMMDD to YYYY-MM-DD", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO9012310M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.dateOfBirth).toBe("1990-12-31");
    });

    it("handles century overflow for dates (70+ -> 1900s)", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO7001019M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.dateOfBirth).toBe("1970-01-01");
    });

    it("handles dates with 49 or less as 2000s", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO4901017M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.dateOfBirth).toBe("2049-01-01");
    });

    it("handles gender F correctly", () => {
      const line1 = "P<UTOMUSTER<<JANE<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105F2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

      expect(result.gender).toBe("F");
    });

    it("produces expected field structure", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
      const result = service.parseMrzLines([line1, line2]);

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
      expect(result).toHaveProperty("checkDigits");
      expect(result).toHaveProperty("mrzLines");
    });
  });
});
