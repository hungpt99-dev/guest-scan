import { describe, it, expect } from "vitest";
import {
  checkGuestRow,
  checkTemplateMatch,
  checkAutoSaveSafety,
  checkMappedValuesExist,
  checkConfidence,
  checkFieldAccuracy,
  getFieldAccuracyInfo,
  fuzzyMatchNames,
  stripDiacritics,
  levenshteinDistance,
  getCharacterAmbiguityWarnings,
  validatePassportForCountry,
  getCrossFieldIssues,
  getAccuracyRecommendations,
  getAggregateAccuracy,
  applyTransformsWithValidation,
  getDaysUntilExpiry,
} from "../../../features/fill/safetyEngine";
import type { GuestRow, TargetSystemTemplate } from "@guestfill/shared";

function createGuest(overrides: Partial<GuestRow> = {}): GuestRow {
  return {
    id: "guest-1",
    sessionId: "session-1",
    rowId: "row-1",
    fullName: "John Doe",
    surname: "Doe",
    givenName: "John",
    passportNumber: "347777777",
    nationality: "USA",
    dateOfBirth: "1990-01-01",
    gender: "M",
    passportExpiryDate: "2030-01-01",
    issuingCountry: "USA",
    documentType: "PASSPORT",
    status: "READY",
    fillStatus: "PENDING",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function createTemplate(overrides: Partial<TargetSystemTemplate> = {}): TargetSystemTemplate {
  return {
    id: "tpl-1",
    name: "Test Template",
    type: "copy_assistant",
    saveMode: "manual",
    mappings: [
      {
        id: "m1",
        excelColumn: "fullName",
        targetFieldName: "Full Name",
        targetType: "copy",
        required: true,
        enabled: true,
      },
    ],
    safetyRules: [],
    version: "1.0.0",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("safetyEngine", () => {
  describe("checkGuestRow", () => {
    it("passes for a valid READY guest", () => {
      const result = checkGuestRow(createGuest());
      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(3);
    });

    it("fails for guest without id", () => {
      const result = checkGuestRow(createGuest({ id: "" }));
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "guest_row_exists")?.passed).toBe(false);
    });

    it("fails for FAILED guest without confirmation", () => {
      const result = checkGuestRow(createGuest({ status: "FAILED" }));
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "guest_not_failed")?.passed).toBe(false);
    });

    it("passes for FAILED guest with confirmation", () => {
      const result = checkGuestRow(createGuest({ status: "FAILED" }), true);
      expect(result.checks.find((c) => c.name === "guest_not_failed")?.passed).toBe(true);
    });

    it("fails for guest without fullName", () => {
      const result = checkGuestRow(createGuest({ fullName: "" }));
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "required_fields_exist")?.passed).toBe(false);
    });

    it("fails for PASSPORT guest without passportNumber", () => {
      const result = checkGuestRow(createGuest({ passportNumber: "" }));
      expect(result.passed).toBe(false);
    });

    it("fails for ID_CARD guest without idNumber", () => {
      const result = checkGuestRow(createGuest({ documentType: "ID_CARD", idNumber: "" }));
      expect(result.passed).toBe(false);
    });
  });

  describe("checkTemplateMatch", () => {
    it("passes with valid template and matching URL", () => {
      const template = createTemplate({ urlPattern: "example.com/*" });
      const result = checkTemplateMatch(template, "https://example.com/guests");
      expect(result.passed).toBe(true);
    });

    it("fails when URL does not match pattern", () => {
      const template = createTemplate({ urlPattern: "example.com/*" });
      const result = checkTemplateMatch(template, "https://other.com/page");
      expect(result.passed).toBe(false);
    });

    it("passes when no URL pattern set", () => {
      const result = checkTemplateMatch(createTemplate(), "https://example.com");
      expect(result.checks.find((c) => c.name === "url_matches")?.passed).toBe(true);
    });

    it("fails when template has no id", () => {
      const result = checkTemplateMatch(createTemplate({ id: "" }));
      expect(result.checks.find((c) => c.name === "template_exists")?.passed).toBe(false);
    });

    it("checks window title match", () => {
      const template = createTemplate({ windowTitlePattern: "Hotel" });
      const result = checkTemplateMatch(template, undefined, "Hotel PMS System");
      expect(result.checks.find((c) => c.name === "window_title_matches")?.passed).toBe(true);
    });

    it("fails when no mapped fields exist", () => {
      const template = createTemplate({ mappings: [] });
      const result = checkTemplateMatch(template);
      expect(result.checks.find((c) => c.name === "has_mapped_fields")?.passed).toBe(false);
    });
  });

  describe("checkAutoSaveSafety", () => {
    it("passes for auto-save template with all requirements", () => {
      const template = createTemplate({ saveMode: "auto", autoSaveSelector: "#save-btn" });
      const guest = createGuest();
      const result = checkAutoSaveSafety(template, guest);
      expect(result.passed).toBe(true);
    });

    it("fails for manual save template", () => {
      const result = checkAutoSaveSafety(createTemplate({ saveMode: "manual" }), createGuest());
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "auto_save_enabled")?.passed).toBe(false);
    });

    it("fails when auto-save selector is not configured", () => {
      const template = createTemplate({ saveMode: "auto" });
      const result = checkAutoSaveSafety(template, createGuest());
      expect(result.checks.find((c) => c.name === "auto_save_configured")?.passed).toBe(false);
    });

    it("fails when required values are missing", () => {
      const template = createTemplate({ saveMode: "auto", autoSaveSelector: "#save-btn" });
      const guest = createGuest({ fullName: "" });
      const result = checkAutoSaveSafety(template, guest);
      expect(result.checks.find((c) => c.name === "required_values_exist")?.passed).toBe(false);
    });

    it("fails when guest has FAILED status", () => {
      const template = createTemplate({ saveMode: "auto", autoSaveSelector: "#save-btn" });
      const guest = createGuest({ status: "FAILED" });
      const result = checkAutoSaveSafety(template, guest);
      expect(result.checks.find((c) => c.name === "guest_not_failed")?.passed).toBe(false);
    });
  });

  describe("checkMappedValuesExist", () => {
    it("passes when all mapped values exist", () => {
      const template = createTemplate();
      const guest = createGuest();
      const result = checkMappedValuesExist(guest, template);
      expect(result.passed).toBe(true);
    });

    it("fails when a mapped value is missing", () => {
      const template = createTemplate();
      const guest = createGuest({ fullName: "" });
      const result = checkMappedValuesExist(guest, template);
      expect(result.passed).toBe(false);
    });

    it("skips disabled mappings", () => {
      const template = createTemplate({
        mappings: [
          {
            id: "m1",
            excelColumn: "fullName",
            targetFieldName: "Full Name",
            targetType: "copy",
            required: true,
            enabled: false,
          },
        ],
      });
      const guest = createGuest({ fullName: "" });
      const result = checkMappedValuesExist(guest, template);
      expect(result.passed).toBe(true);
    });
  });

  describe("checkConfidence", () => {
    it("passes for high confidence guest", () => {
      const guest = createGuest({ confidenceScore: 0.95, confidenceLevel: "HIGH" });
      const result = checkConfidence(guest);
      expect(result.passed).toBe(true);
    });

    it("fails for low confidence guest", () => {
      const guest = createGuest({ confidenceScore: 0.45, confidenceLevel: "LOW" });
      const result = checkConfidence(guest);
      expect(result.passed).toBe(false);
    });

    it("fails for medium confidence guest", () => {
      const guest = createGuest({ confidenceScore: 0.75, confidenceLevel: "MEDIUM" });
      const result = checkConfidence(guest);
      expect(result.passed).toBe(false);
    });

    it("fails for guest with no confidence data", () => {
      const guest = createGuest({ confidenceScore: undefined, confidenceLevel: undefined });
      const result = checkConfidence(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "high_confidence")?.passed).toBe(false);
    });
  });

  describe("checkFieldAccuracy", () => {
    it("passes for a valid guest with clean data", () => {
      const guest = createGuest();
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(true);
    });

    it("fails for guest with short name", () => {
      const guest = createGuest({ fullName: "A" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "field_fullName_length")?.passed).toBe(false);
    });

    it("fails for guest with digits-only name", () => {
      const guest = createGuest({ fullName: "12345" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "field_fullName_digits")?.passed).toBe(false);
    });

    it("fails for guest with invalid passport number format", () => {
      const guest = createGuest({ passportNumber: "!@#$%" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
    });

    it("fails for zero-filled passport number", () => {
      const guest = createGuest({ passportNumber: "00000000" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "field_passportNumber_zeros")?.passed).toBe(false);
    });

    it("fails for future date of birth", () => {
      const guest = createGuest({ dateOfBirth: "2099-01-01" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
    });

    it("fails for expired passport", () => {
      const guest = createGuest({ passportExpiryDate: "2020-01-01" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "field_passportExpiryDate_expired")?.passed).toBe(false);
    });

    it("flags nationality/issuing country mismatch", () => {
      const guest = createGuest({ nationality: "VN", issuingCountry: "CN" });
      const result = checkFieldAccuracy(guest);
      expect(result.checks.find((c) => c.name === "field_nationality_consistency")?.passed).toBe(false);
    });

    it("passes for valid ID card guest", () => {
      const guest = createGuest({ documentType: "ID_CARD", passportNumber: undefined, idNumber: "ID123456789" });
      const result = checkFieldAccuracy(guest);
      expect(result.passed).toBe(true);
    });
  });

  describe("getFieldAccuracyInfo", () => {
    it("returns accuracy info for multiple fields", () => {
      const guest = createGuest();
      const info = getFieldAccuracyInfo(guest);
      expect(info.length).toBeGreaterThanOrEqual(3);
      const nameInfo = info.find((i) => i.field === "fullName");
      expect(nameInfo).toBeDefined();
      expect(nameInfo?.level).toBe("HIGH");
    });

    it("returns LOW accuracy for problematic data", () => {
      const guest = createGuest({ fullName: "12", passportNumber: "0000", gender: "UNKNOWN" });
      const info = getFieldAccuracyInfo(guest);
      const nameInfo = info.find((i) => i.field === "fullName");
      expect(nameInfo?.level).toBe("LOW");
      const passportInfo = info.find((i) => i.field === "passportNumber");
      expect(passportInfo?.level).toBe("LOW");
    });

    it("includes surname and givenName accuracy when present", () => {
      const guest = createGuest({ surname: "Smith", givenName: "John" });
      const info = getFieldAccuracyInfo(guest);
      expect(info.find((i) => i.field === "surname")).toBeDefined();
      expect(info.find((i) => i.field === "givenName")).toBeDefined();
    });
  });

  describe("stripDiacritics", () => {
    it("removes diacritics from Vietnamese characters", () => {
      expect(stripDiacritics("Nguyễn Văn")).toBe("Nguyen Van");
    });

    it("removes diacritics from accented European characters", () => {
      expect(stripDiacritics("José Müller")).toBe("Jose Muller");
    });

    it("leaves ASCII text unchanged", () => {
      expect(stripDiacritics("John Doe")).toBe("John Doe");
    });

    it("handles empty string", () => {
      expect(stripDiacritics("")).toBe("");
    });
  });

  describe("levenshteinDistance", () => {
    it("returns 0 for identical strings", () => {
      expect(levenshteinDistance("hello", "hello")).toBe(0);
    });

    it("returns correct distance for single substitution", () => {
      expect(levenshteinDistance("cat", "car")).toBe(1);
    });

    it("returns correct distance for insertion", () => {
      expect(levenshteinDistance("cat", "cats")).toBe(1);
    });

    it("returns correct distance for deletion", () => {
      expect(levenshteinDistance("cats", "cat")).toBe(1);
    });

    it("handles completely different strings", () => {
      expect(levenshteinDistance("abc", "xyz")).toBe(3);
    });

    it("handles empty string", () => {
      expect(levenshteinDistance("", "abc")).toBe(3);
    });
  });

  describe("fuzzyMatchNames", () => {
    it("returns exact match for identical names", () => {
      const result = fuzzyMatchNames("Nguyen Van A", "Nguyen Van A");
      expect(result.match).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.method).toBe("exact");
    });

    it("matches after diacritic stripping", () => {
      const result = fuzzyMatchNames("Nguyễn", "Nguyen");
      expect(result.match).toBe(true);
      expect(result.similarity).toBe(0.95);
      expect(result.method).toBe("normalized");
    });

    it("matches with Levenshtein for similar names", () => {
      const result = fuzzyMatchNames("Jon", "John");
      expect(result.match).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.7);
      expect(result.method).toBe("soundex");
    });

    it("rejects very different names", () => {
      const result = fuzzyMatchNames("Alice", "Robert");
      expect(result.match).toBe(false);
      expect(result.similarity).toBeLessThan(0.7);
    });

    it("is case insensitive", () => {
      const result = fuzzyMatchNames("john", "John");
      expect(result.match).toBe(true);
      expect(result.similarity).toBe(1.0);
    });
  });

  describe("getCharacterAmbiguityWarnings", () => {
    it("detects 0/O ambiguity", () => {
      const warnings = getCharacterAmbiguityWarnings("AB0CD");
      expect(warnings.some((w) => w.char === "0")).toBe(true);
    });

    it("detects 1/I/l ambiguity", () => {
      const warnings = getCharacterAmbiguityWarnings("123I5");
      const iWarnings = warnings.filter((w) => w.char === "I");
      expect(iWarnings.length).toBeGreaterThan(0);
      expect(iWarnings[0]?.suggestions).toContain("1");
    });

    it("detects no warnings for clean alphanumeric without ambiguous chars", () => {
      const warnings = getCharacterAmbiguityWarnings("CDEFHJK");
      expect(warnings.length).toBe(0);
    });

    it("detects multiple ambiguities", () => {
      const warnings = getCharacterAmbiguityWarnings("0O1I5S");
      expect(warnings.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("validatePassportForCountry", () => {
    it("accepts valid GBR passport format", () => {
      const result = validatePassportForCountry("123456789", "GBR");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid GBR passport format", () => {
      const result = validatePassportForCountry("AB123456", "GBR");
      expect(result.valid).toBe(false);
    });

    it("accepts valid VNM passport format", () => {
      const result = validatePassportForCountry("A1234567", "VNM");
      expect(result.valid).toBe(true);
    });

    it("accepts valid USA passport format", () => {
      const result = validatePassportForCountry("123456789", "USA");
      expect(result.valid).toBe(true);
    });

    it("fallback to generic check for unknown country", () => {
      const result = validatePassportForCountry("ABC123", "XYZ");
      expect(result.valid).toBe(true);
    });

    it("rejects invalid format for known country", () => {
      const result = validatePassportForCountry("AB", "GBR");
      expect(result.valid).toBe(false);
    });
  });

  describe("getCrossFieldIssues", () => {
    it("detects nationality vs issuing country mismatch", () => {
      const guest = createGuest({ nationality: "VN", issuingCountry: "CN" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("Nationality"))).toBe(true);
    });

    it("passes when nationality matches issuing country", () => {
      const guest = createGuest({ nationality: "VN", issuingCountry: "VNM" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("Nationality"))).toBe(false);
    });

    it("detects swapped passport expiry vs DOB", () => {
      const guest = createGuest({ dateOfBirth: "2030-01-01", passportExpiryDate: "2020-01-01" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("swapped"))).toBe(true);
    });

    it("detects passport format mismatch with nationality", () => {
      const guest = createGuest({ passportNumber: "AB12", nationality: "GBR" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("GBR passport"))).toBe(true);
    });

    it("returns empty for consistent data", () => {
      const guest = createGuest();
      const issues = getCrossFieldIssues(guest);
      expect(issues.length).toBe(0);
    });
  });

  describe("getAccuracyRecommendations", () => {
    it("recommends checking short names", () => {
      const guest = createGuest({ fullName: "A" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "fullName" && r.priority === "high")).toBe(true);
    });

    it("recommends checking OCR misreads in passport", () => {
      const guest = createGuest({ passportNumber: "AB0CD1E" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportNumber" && r.message.includes("OCR"))).toBe(true);
    });

    it("recommends checking country-specific passport pattern", () => {
      const guest = createGuest({ passportNumber: "AB12", nationality: "GBR" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportNumber" && r.message.includes("GBR"))).toBe(true);
    });

    it("recommends converting 2-letter nationality to ISO3", () => {
      const guest = createGuest({ nationality: "VN" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "nationality" && r.message.includes("2-letter"))).toBe(true);
    });
  });

  describe("getAggregateAccuracy", () => {
    it("returns HIGH for clean guest data", () => {
      const guest = createGuest();
      const result = getAggregateAccuracy(guest);
      expect(result.overallLevel).toBe("HIGH");
      expect(result.overallScore).toBeGreaterThanOrEqual(0.9);
    });

    it("returns LOW for problematic guest data", () => {
      const guest = createGuest({
        fullName: "12",
        passportNumber: "0000",
        gender: "UNKNOWN",
      });
      const result = getAggregateAccuracy(guest);
      expect(result.overallLevel).toBe("LOW");
    });

    it("includes per-field accuracy info", () => {
      const guest = createGuest();
      const result = getAggregateAccuracy(guest);
      expect(result.perField.length).toBeGreaterThan(0);
    });

    it("includes recommendations for low accuracy fields", () => {
      const guest = createGuest({
        fullName: "A",
        passportNumber: "AB0CD1E",
        nationality: "VN",
      });
      const result = getAggregateAccuracy(guest);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("applyTransformsWithValidation", () => {
    it("passes for valid transform chain", () => {
      const result = applyTransformsWithValidation("  John Doe  ", [{ type: "trim" }, { type: "uppercase" }]);
      expect(result.valid).toBe(true);
      expect(result.result).toBe("JOHN DOE");
    });

    it("detects broken transform that produces empty result", () => {
      const result = applyTransformsWithValidation("John", [{ type: "replace", from: "John", to: "" }]);
      expect(result.valid).toBe(false);
      expect(result.brokenStep).toBe(0);
      expect(result.error).toContain("empty result");
    });

    it("passes for single transform", () => {
      const result = applyTransformsWithValidation("hello", [{ type: "uppercase" }]);
      expect(result.valid).toBe(true);
      expect(result.result).toBe("HELLO");
    });

    it("handles empty input gracefully", () => {
      const result = applyTransformsWithValidation("", [{ type: "trim" }]);
      expect(result.valid).toBe(true);
      expect(result.result).toBe("");
    });
  });

  describe("getDaysUntilExpiry", () => {
    it("returns null for undefined date", () => {
      expect(getDaysUntilExpiry(undefined)).toBeNull();
    });

    it("returns null for invalid date", () => {
      expect(getDaysUntilExpiry("invalid")).toBeNull();
    });

    it("returns positive number for future date", () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);
      const days = getDaysUntilExpiry(future.toISOString().slice(0, 10));
      expect(days).toBeGreaterThan(365);
    });

    it("returns negative number for past date", () => {
      const past = new Date("2020-01-01");
      const days = getDaysUntilExpiry(past.toISOString().slice(0, 10));
      expect(days).toBeLessThan(0);
    });
  });

  describe("cross-field gender consistency", () => {
    it("detects name-gender mismatch (male name with F gender)", () => {
      const guest = createGuest({ fullName: "John Smith", gender: "F" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.toLowerCase().includes("male") && i.toLowerCase().includes("female"))).toBe(true);
    });

    it("detects name-gender mismatch (female name with M gender)", () => {
      const guest = createGuest({ fullName: "Mary Johnson", gender: "M" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.toLowerCase().includes("female") && i.toLowerCase().includes("male"))).toBe(true);
    });

    it("passes for matching name and gender", () => {
      const guest = createGuest({ fullName: "John Smith", gender: "M" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("gender"))).toBe(false);
    });

    it("passes for ambiguous names", () => {
      const guest = createGuest({ fullName: "Alex Smith", gender: "M" });
      const issues = getCrossFieldIssues(guest);
      expect(issues.some((i) => i.includes("gender"))).toBe(false);
    });
  });

  describe("improved accuracy recommendations", () => {
    it("recommends checking near-expiry passport", () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const guest = createGuest({ passportExpiryDate: future.toISOString().slice(0, 10) });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportExpiryDate" && r.message.includes("expires"))).toBe(true);
    });

    it("recommends checking expired passport", () => {
      const guest = createGuest({ passportExpiryDate: "2020-01-01" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportExpiryDate" && r.message.includes("expired"))).toBe(true);
    });

    it("does not warn for passport expiring far in future", () => {
      const guest = createGuest({ passportExpiryDate: "2030-01-01" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportExpiryDate")).toBe(false);
    });

    it("recommends verifying short passport number", () => {
      const guest = createGuest({ passportNumber: "AB12" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "passportNumber" && r.message.includes("incomplete"))).toBe(true);
    });

    it("recommends checking surname-only fullName", () => {
      const guest = createGuest({ fullName: "SMITH", surname: "SMITH", givenName: "" });
      const recs = getAccuracyRecommendations(guest);
      expect(recs.some((r) => r.field === "fullName" && r.message.includes("surname"))).toBe(true);
    });
  });

  describe("improved date accuracy", () => {
    it("gives LOW accuracy for document expired long ago", () => {
      const info = getFieldAccuracyInfo(createGuest({ passportExpiryDate: "2020-01-01" }));
      const expiryInfo = info.find((i) => i.field === "passportExpiryDate");
      expect(expiryInfo?.level).toBe("LOW");
      expect(expiryInfo?.issues.some((i) => i.includes("expired"))).toBe(true);
    });

    it("gives MEDIUM accuracy for near-expiry document", () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const info = getFieldAccuracyInfo(createGuest({ passportExpiryDate: future.toISOString().slice(0, 10) }));
      const expiryInfo = info.find((i) => i.field === "passportExpiryDate");
      expect(expiryInfo?.score).toBeLessThan(1);
    });
  });

  describe("improved checkFieldAccuracy", () => {
    it("checks gender vs name consistency in field accuracy", () => {
      const guest = createGuest({ fullName: "John Smith", gender: "F" });
      const result = checkFieldAccuracy(guest);
      expect(result.checks.some((c) => c.name === "field_gender_name_consistency")).toBe(true);
    });

    it("passes for consistent gender and name", () => {
      const guest = createGuest({ fullName: "John Smith", gender: "M" });
      const result = checkFieldAccuracy(guest);
      expect(result.checks.some((c) => c.name === "field_gender_name_consistency")).toBe(false);
    });
  });
});
