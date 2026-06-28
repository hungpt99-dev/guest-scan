import { describe, it, expect } from "vitest";
import {
  checkGuestRow,
  checkTemplateMatch,
  checkAutoSaveSafety,
  checkMappedValuesExist,
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
});
