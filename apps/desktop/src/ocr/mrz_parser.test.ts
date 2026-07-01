import { describe, it, expect } from "vitest";
import {
  parseMrz,
  detectMrzFormat,
  validateMrzChecksums,
  correctMrzOcrErrors,
  computeMrzCheckDigit,
  hasAmbiguousChars,
} from "./mrz_parser";

describe("detectMrzFormat", () => {
  it("detects TD3 format (passport, 2x44 chars)", () => {
    const lines = [
      "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
      "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    ];
    expect(detectMrzFormat(lines)).toBe("TD3");
  });

  it("detects TD2 format (visa, 2x36 chars)", () => {
    const lines = ["I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<", "AB123456<4UTO8510105M2001012<<<<<<<<"];
    expect(detectMrzFormat(lines)).toBe("TD2");
  });

  it("detects TD1 format (ID card, 3x30 chars)", () => {
    const lines = [
      "I<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<",
      "AB123456<4UTO8510105M2001012<<<<",
      "1234567890<<<<<<<<<<<<<<<<<<<<<<<",
    ];
    expect(detectMrzFormat(lines)).toBe("TD1");
  });

  it("returns UNKNOWN for fewer than 2 lines", () => {
    expect(detectMrzFormat(["P<UTOMUSTER"])).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for short lines", () => {
    expect(detectMrzFormat(["SHORT", "LINE"])).toBe("UNKNOWN");
  });
});

describe("computeMrzCheckDigit", () => {
  it("computes check digit correctly for passport number", () => {
    expect(computeMrzCheckDigit("AB123456")).toBe("4");
  });

  it("computes check digit for date of birth", () => {
    expect(computeMrzCheckDigit("851010")).toBe("5");
  });

  it("computes check digit for expiry date", () => {
    expect(computeMrzCheckDigit("200101")).toBe("2");
  });

  it("handles < filler characters", () => {
    expect(computeMrzCheckDigit("AB123<456")).toBe("6");
  });

  it("computes correct check digit for full passport field", () => {
    expect(computeMrzCheckDigit("AB123456<")).toBe("4");
  });
});

describe("parseMrz - TD3 passport", () => {
  const validLine1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
  const validLine2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";

  it("parses all fields correctly", () => {
    const result = parseMrz([validLine1, validLine2]);

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
    expect(result.optionalData.value).toBe("");
  });

  it("reports valid check digits for a valid MRZ", () => {
    const result = parseMrz([validLine1, validLine2]);

    expect(result.checkDigits.passport_number_valid).toBe(true);
    expect(result.checkDigits.date_of_birth_valid).toBe(true);
    expect(result.checkDigits.expiry_date_valid).toBe(true);
    expect(result.checkDigits.overall_valid).toBe(true);
    expect(result.overallValid).toBe(true);
  });

  it("reports no corrections for a valid MRZ", () => {
    const result = parseMrz([validLine1, validLine2]);
    expect(result.corrections.length).toBe(0);
  });

  it("parses ID card with I< prefix", () => {
    const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);

    expect(result.documentType.value).toBe("ID_CARD");
  });
});

describe("parseMrz - TD2", () => {
  it("parses TD2 format correctly", () => {
    const line1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<";
    const result = parseMrz([line1, line2]);

    expect(result.format).toBe("TD2");
    expect(result.documentType.value).toBe("ID_CARD");
    expect(result.surname.value).toBe("MUSTER");
    expect(result.givenName.value).toBe("JOHN MICHAEL");
    expect(result.passportNumber.value).toBe("AB123456");
    expect(result.dateOfBirth.value).toBe("1985-10-10");
    expect(result.expiryDate.value).toBe("2020-01-01");
    expect(result.overallValid).toBe(true);
  });
});

describe("parseMrz - TD1", () => {
  it("parses TD1 format correctly", () => {
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
    expect(result.expiryDate.value).toBe("2020-01-01");
  });
});

describe("parseMrz - date parsing", () => {
  it("handles century break for dates (youth -> 2000s)", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO4901013M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("2049-01-01");
  });

  it("handles century break for dates (older -> 1900s)", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO7001017M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.dateOfBirth.value).toBe("1970-01-01");
  });

  it("handles gender F correctly", () => {
    const line1 = "P<UTOMUSTER<<JANE<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105F2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.gender.value).toBe("F");
  });
});

describe("parseMrz - edge cases", () => {
  it("handles fewer than 2 lines gracefully", () => {
    const result = parseMrz(["P<UTOMUSTER"]);
    expect(result.format).toBe("UNKNOWN");
    expect(result.surname.value).toBe("");
  });

  it("handles empty array", () => {
    const result = parseMrz([]);
    expect(result.format).toBe("UNKNOWN");
  });

  it("handles unknown format", () => {
    const result = parseMrz(["SHORT", "LINE"]);
    expect(result.format).toBe("UNKNOWN");
  });

  it("strips filler characters from passport number", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123<456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("AB123456");
  });
});

describe("OCR error correction", () => {
  describe("hasAmbiguousChars", () => {
    it("detects ambiguous characters", () => {
      expect(hasAmbiguousChars("AB123O56")).toBe(true);
      expect(hasAmbiguousChars("AB123I56")).toBe(true);
      expect(hasAmbiguousChars("AB123456")).toBe(true);
      expect(hasAmbiguousChars("MUSTER")).toBe(false);
    });
  });

  describe("passport number O/0 checksum validation", () => {
    it("detects invalid checksum when O used in place of 0", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123O56<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";

      const result = parseMrz([line1, line2]);

      expect(result.checkDigits.passport_number_valid).toBe(false);
    });
  });

  describe("date of birth I/1 correction", () => {
    it("corrects letter I to digit 1 in date of birth", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO85I0105M2001012<<<<<<<<<<<<<<<<0<<";

      const result = parseMrz([line1, line2]);

      expect(result.dateOfBirth.value).toBe("1985-10-10");
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("expiry date O/0 correction", () => {
    it("corrects letter O to digit 0 in expiry date", () => {
      const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M20O1012<<<<<<<<<<<<<<<<0<<";

      const result = parseMrz([line1, line2]);

      expect(result.expiryDate.value).toBe("2020-01-01");
    });
  });

  describe("name field 0/O correction", () => {
    it("corrects digit 0 to letter O in given name", () => {
      const line1 = "P<UTOMUSTER<<J0HN<<<<<<<<<<<<<<<<<<<<<<<<<<<";
      const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";

      const result = parseMrz([line1, line2]);

      expect(result.surname.value).toBe("MUSTER");
      expect(result.givenName.value).toBe("JOHN");
    });
  });
});

describe("validateMrzChecksums", () => {
  it("returns valid for correct MRZ", () => {
    const lines = [
      "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
      "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    ];
    const result = validateMrzChecksums(lines);
    expect(result.overallValid).toBe(true);
  });

  it("detects invalid passport number checksum", () => {
    const lines = [
      "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
      "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    ];
    const result = validateMrzChecksums(lines);
    expect(result.passport_number_valid).toBe(false);
    expect(result.overallValid).toBe(false);
  });

  it("returns invalid for fewer than 2 lines", () => {
    const result = validateMrzChecksums(["P<UTOMUSTER"]);
    expect(result.overallValid).toBe(false);
  });

  it("detects invalid date of birth checksum", () => {
    const lines = [
      "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
      "AB123456<4UTO851010XM2001012<<<<<<<<<<<<<<<<0<<",
    ];
    const result = validateMrzChecksums(lines);
    expect(result.date_of_birth_valid).toBe(false);
  });
});

describe("correctMrzOcrErrors", () => {
  it("returns original lines when no correction needed", () => {
    const lines = [
      "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
      "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    ];
    const result = correctMrzOcrErrors(lines);
    expect(result.lines).toEqual(lines);
    expect(result.corrections.length).toBe(0);
  });

  it("returns corrections for ambiguous characters in name", () => {
    const lines = ["P<UTOMUSTER<<J0HN<<<<<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<"];
    const result = correctMrzOcrErrors(lines);
    expect(result.corrections.length).toBeGreaterThan(0);
  });
});

describe("parseMrz - optional data", () => {
  it("extracts optional data in TD3", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M200101212345678<<<<<0";
    const result = parseMrz([line1, line2]);
    expect(result.optionalData.value).toBe("12345678");
  });
});

describe("parseMrz - with options", () => {
  it("disables checksum validation when option is false", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<XUTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2], { validateChecksums: false });
    expect(Object.keys(result.checkDigits).length).toBe(0);
  });

  it("disables OCR correction when option is false", () => {
    const line1 = "P<UTOMUSTER<<J0HN<<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2], { correctOcrErrors: false });
    expect(result.givenName.value).toBe("J0HN");
    expect(result.corrections.length).toBe(0);
  });
});

describe("edge cases", () => {
  it("handles field with invalid checksum and no ambiguous chars", () => {
    const line1 = "P<UTOMUSTER<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<";
    const line2 = "XB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";
    const result = parseMrz([line1, line2]);
    expect(result.passportNumber.value).toBe("XB123456");
    expect(result.checkDigits.passport_number_valid).toBe(false);
  });

  it("does not crash on very short lines", () => {
    const result = parseMrz(["A", "B"]);
    expect(result.format).toBe("UNKNOWN");
  });
});
