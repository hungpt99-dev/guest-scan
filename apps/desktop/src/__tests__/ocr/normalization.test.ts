import { describe, it, expect } from "vitest";
import {
  getConfidenceLevel,
  makeField,
  normalizeDate,
  normalizeGender,
  normalizeDocumentType,
  normalizeCountryCode,
  normalizeDocumentNumber,
  checkDateExpired,
  checkDateExpiringSoon,
  buildFieldConfidence,
} from "../../ocr/utils/normalization";

describe("getConfidenceLevel", () => {
  it("returns HIGH for score >= 0.8", () => {
    expect(getConfidenceLevel(0.8)).toBe("HIGH");
    expect(getConfidenceLevel(0.95)).toBe("HIGH");
    expect(getConfidenceLevel(1.0)).toBe("HIGH");
  });

  it("returns MEDIUM for score between 0.5 and 0.8", () => {
    expect(getConfidenceLevel(0.5)).toBe("MEDIUM");
    expect(getConfidenceLevel(0.65)).toBe("MEDIUM");
    expect(getConfidenceLevel(0.79)).toBe("MEDIUM");
  });

  it("returns LOW for score < 0.5", () => {
    expect(getConfidenceLevel(0.0)).toBe("LOW");
    expect(getConfidenceLevel(0.3)).toBe("LOW");
    expect(getConfidenceLevel(0.49)).toBe("LOW");
  });

  it("handles edge threshold values", () => {
    expect(getConfidenceLevel(0.799)).toBe("MEDIUM");
    expect(getConfidenceLevel(0.8)).toBe("HIGH");
    expect(getConfidenceLevel(0.499)).toBe("LOW");
    expect(getConfidenceLevel(0.5)).toBe("MEDIUM");
  });
});

describe("makeField", () => {
  it("creates field with value and confidence", () => {
    const field = makeField("John", 0.95);
    expect(field).toEqual({ value: "John", confidence: 0.95 });
  });

  it("includes source when provided", () => {
    const field = makeField("M", 0.99, "mrz");
    expect(field).toEqual({ value: "M", confidence: 0.99, source: "mrz" });
  });

  it("omits source when not provided", () => {
    const field = makeField("", 0.0);
    expect(field.source).toBeUndefined();
  });

  it("handles empty string value", () => {
    const field = makeField("", 0.5);
    expect(field.value).toBe("");
    expect(field.confidence).toBe(0.5);
  });
});

describe("normalizeDate", () => {
  it("returns ISO dates unchanged", () => {
    expect(normalizeDate("2025-06-15")).toBe("2025-06-15");
  });

  it("normalizes YYYY/MM/DD with slashes", () => {
    expect(normalizeDate("2025/06/15")).toBe("2025-06-15");
  });

  it("normalizes YYYY.MM.DD with dots", () => {
    expect(normalizeDate("2025.06.15")).toBe("2025-06-15");
  });

  it("normalizes DD/MM/YYYY (EU format)", () => {
    expect(normalizeDate("15/06/2025")).toBe("2025-06-15");
  });

  it("normalizes DD.MM.YYYY (EU format with dots)", () => {
    expect(normalizeDate("15.06.2025")).toBe("2025-06-15");
  });

  it("normalizes 8-digit YYYYMMDD format", () => {
    expect(normalizeDate("20250615")).toBe("2025-06-15");
  });

  it("normalizes 6-digit YYMMDD format", () => {
    expect(normalizeDate("850610")).toBe("1985-06-10");
  });

  it("normalizes 6-digit with 2000s century", () => {
    expect(normalizeDate("050610")).toBe("2005-06-10");
  });

  it("returns null for completely invalid input", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("abc")).toBeNull();
  });

  it("handles single-digit month and day", () => {
    expect(normalizeDate("2025-1-5")).toBe("2025-01-05");
  });

  it("handles MRZ date format YYMMDD", () => {
    expect(normalizeDate("851010")).toBe("1985-10-10");
    expect(normalizeDate("150505")).toBe("2015-05-05");
  });
});

describe("normalizeGender", () => {
  it("normalizes M to M", () => {
    expect(normalizeGender("M")).toBe("M");
  });

  it("normalizes F to F", () => {
    expect(normalizeGender("F")).toBe("F");
  });

  it("normalizes X to X", () => {
    expect(normalizeGender("X")).toBe("X");
  });

  it("normalizes MALE to M", () => {
    expect(normalizeGender("MALE")).toBe("M");
  });

  it("normalizes FEMALE to F", () => {
    expect(normalizeGender("FEMALE")).toBe("F");
  });

  it("normalizes lowercase input", () => {
    expect(normalizeGender("m")).toBe("M");
    expect(normalizeGender("f")).toBe("F");
    expect(normalizeGender("x")).toBe("X");
  });

  it("trims whitespace", () => {
    expect(normalizeGender(" M ")).toBe("M");
  });

  it("returns UNKNOWN for unrecognized", () => {
    expect(normalizeGender("OTHER")).toBe("UNKNOWN");
    expect(normalizeGender("")).toBe("UNKNOWN");
    expect(normalizeGender("CUSTOM")).toBe("UNKNOWN");
  });
});

describe("normalizeDocumentType", () => {
  it("recognizes PASSPORT", () => {
    expect(normalizeDocumentType("PASSPORT")).toBe("PASSPORT");
  });

  it("recognizes P as passport", () => {
    expect(normalizeDocumentType("P")).toBe("PASSPORT");
  });

  it("recognizes PN as passport", () => {
    expect(normalizeDocumentType("PN")).toBe("PASSPORT");
  });

  it("recognizes PD as passport", () => {
    expect(normalizeDocumentType("PD")).toBe("PASSPORT");
  });

  it("recognizes ID_CARD", () => {
    expect(normalizeDocumentType("ID_CARD")).toBe("ID_CARD");
  });

  it("recognizes ID", () => {
    expect(normalizeDocumentType("ID")).toBe("ID_CARD");
  });

  it("recognizes I as ID card", () => {
    expect(normalizeDocumentType("I")).toBe("ID_CARD");
  });

  it("recognizes variations like IDENTITY", () => {
    expect(normalizeDocumentType("IDENTITY")).toBe("ID_CARD");
    expect(normalizeDocumentType("IDENTIFICATION")).toBe("ID_CARD");
  });

  it("handles case insensitivity", () => {
    expect(normalizeDocumentType("passport")).toBe("PASSPORT");
    expect(normalizeDocumentType("id_card")).toBe("ID_CARD");
  });

  it("returns UNKNOWN for unrecognized", () => {
    expect(normalizeDocumentType("DRIVERS_LICENSE")).toBe("UNKNOWN");
    expect(normalizeDocumentType("")).toBe("UNKNOWN");
  });
});

describe("normalizeCountryCode", () => {
  it("strips non-alpha characters", () => {
    expect(normalizeCountryCode("UT0")).toBe("UT");
  });

  it("uppercases result", () => {
    expect(normalizeCountryCode("uto")).toBe("UTO");
  });

  it("limits to 3 characters", () => {
    expect(normalizeCountryCode("USAAA")).toBe("USA");
  });

  it("returns empty for empty input", () => {
    expect(normalizeCountryCode("")).toBe("");
  });

  it("handles mixed input", () => {
    expect(normalizeCountryCode("U.S.A.")).toBe("USA");
  });
});

describe("normalizeDocumentNumber", () => {
  it("removes non-alphanumeric and lowercase characters", () => {
    expect(normalizeDocumentNumber("abc-123 456")).toBe("123456");
    expect(normalizeDocumentNumber("AB-123 456")).toBe("AB123456");
  });

  it("strips lowercase letters then uppercases remaining", () => {
    expect(normalizeDocumentNumber("abCD1234")).toBe("CD1234");
  });

  it("trims whitespace", () => {
    expect(normalizeDocumentNumber("  AB123456  ")).toBe("AB123456");
  });

  it("returns empty for all-invalid input", () => {
    expect(normalizeDocumentNumber("!@#$%")).toBe("");
  });

  it("returns empty for empty input", () => {
    expect(normalizeDocumentNumber("")).toBe("");
  });
});

describe("checkDateExpired", () => {
  it("returns true for past date", () => {
    expect(checkDateExpired("2020-01-01")).toBe(true);
  });

  it("returns false for future date", () => {
    expect(checkDateExpired("2099-01-01")).toBe(false);
  });

  it("returns undefined for invalid date", () => {
    expect(checkDateExpired("not-a-date")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(checkDateExpired("")).toBeUndefined();
  });
});

describe("checkDateExpiringSoon", () => {
  it("returns true for date within 3 months", () => {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 1);
    const dateStr = soon.toISOString().slice(0, 10);
    expect(checkDateExpiringSoon(dateStr)).toBe(true);
  });

  it("returns false for date far in future", () => {
    expect(checkDateExpiringSoon("2099-01-01")).toBe(false);
  });

  it("returns false for invalid date", () => {
    expect(checkDateExpiringSoon("not-a-date")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(checkDateExpiringSoon("")).toBe(false);
  });
});

describe("buildFieldConfidence", () => {
  it("builds confidence map from fields", () => {
    const fields = {
      fullName: { value: "John", confidence: 0.95 } as const,
      passportNumber: { value: "AB123", confidence: 0.99 } as const,
    };
    const map = buildFieldConfidence(fields);
    expect(map).toEqual({
      fullName: 0.95,
      passportNumber: 0.99,
    });
  });

  it("skips null or undefined fields", () => {
    const fields = {
      fullName: { value: "John", confidence: 0.95 } as const,
      nationality: null as unknown as undefined,
      gender: undefined as unknown as undefined,
    };
    const map = buildFieldConfidence(fields);
    expect(map).toEqual({ fullName: 0.95 });
  });

  it("returns empty object for empty fields", () => {
    expect(buildFieldConfidence({})).toEqual({});
  });
});
