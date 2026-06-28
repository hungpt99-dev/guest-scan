import { describe, it, expect } from "vitest";
import {
  checkGuestRow,
  checkTemplateMatch,
  checkAutoSaveSafety,
  checkMappedValuesExist,
  checkConfidence,
  checkFieldAccuracy,
  getFieldAccuracyInfo,
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
    passportNumber: "AB123456",
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
  });
});
