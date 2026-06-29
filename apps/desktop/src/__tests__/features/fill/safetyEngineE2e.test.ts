import { describe, it, expect } from "vitest";
import type { GuestRow, TargetSystemTemplate } from "@guestfill/shared";
import { applyTransforms } from "../../../features/fill/transformEngine";
import {
  checkGuestRow,
  checkTemplateMatch,
  checkAutoSaveSafety,
  checkMappedValuesExist,
  checkConfidence,
  checkFieldAccuracy,
  getFieldAccuracyInfo,
} from "../../../features/fill/safetyEngine";
import { createDefaultTemplate } from "../../../features/fill/templateManager";

function makeGuest(overrides?: Partial<GuestRow>): GuestRow {
  return {
    id: "g1",
    sessionId: "s1",
    rowId: "r1",
    fullName: "John Doe",
    passportNumber: "347777777",
    documentType: "PASSPORT",
    gender: "M",
    status: "READY",
    fillStatus: "PENDING",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTemplate(overrides?: Partial<TargetSystemTemplate>): TargetSystemTemplate {
  const tpl = createDefaultTemplate("Test PMS");
  tpl.mappings = [
    { id: "m1", excelColumn: "fullName", targetFieldName: "Name", targetType: "copy", required: true, enabled: true },
    {
      id: "m2",
      excelColumn: "passportNumber",
      targetFieldName: "Passport",
      targetType: "copy",
      required: true,
      enabled: true,
    },
  ];
  return { ...tpl, ...overrides };
}

describe("Safety Engine + Transform E2E: full pipeline", () => {
  describe("guest row validation", () => {
    it("passes valid guest with all required fields", () => {
      const guest = makeGuest();
      expect(checkGuestRow(guest).passed).toBe(true);
    });

    it("fails guest with missing full name", () => {
      const guest = makeGuest({ fullName: "" });
      const result = checkGuestRow(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "required_fields_exist")?.passed).toBe(false);
    });

    it("fails passport guest without passport number", () => {
      const guest = makeGuest({ passportNumber: undefined });
      const result = checkGuestRow(guest);
      expect(result.passed).toBe(false);
    });

    it("fails ID card guest without ID number", () => {
      const guest = makeGuest({ documentType: "ID_CARD", idNumber: "", passportNumber: undefined });
      const result = checkGuestRow(guest);
      expect(result.passed).toBe(false);
    });

    it("fails guest with FAILED status", () => {
      const guest = makeGuest({ status: "FAILED" });
      const result = checkGuestRow(guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "guest_not_failed")?.passed).toBe(false);
    });

    it("allows FAILED guest with explicit confirmation", () => {
      const guest = makeGuest({ status: "FAILED" });
      const result = checkGuestRow(guest, true);
      expect(result.passed).toBe(true);
      const failedCheck = result.checks.find((c) => c.name === "guest_not_failed");
      expect(failedCheck?.passed).toBe(true);
    });

    it("fails guest with missing row id", () => {
      const guest = { ...makeGuest(), id: "" } as GuestRow;
      const result = checkGuestRow(guest);
      expect(result.passed).toBe(false);
    });

    it("passes guest with NEED_REVIEW status", () => {
      const guest = makeGuest({ status: "NEED_REVIEW", fullName: "Review Me", passportNumber: "CD789012" });
      expect(checkGuestRow(guest).passed).toBe(true);
    });

    it("passes guest with MISSING_DATA status but required fields present", () => {
      const guest = makeGuest({ status: "MISSING_DATA" });
      expect(checkGuestRow(guest).passed).toBe(true);
    });
  });

  describe("template matching", () => {
    it("passes with matching URL pattern", () => {
      const tpl = makeTemplate({ urlPattern: "https://pms.example.com/*" });
      const result = checkTemplateMatch(tpl, "https://pms.example.com/guests/new");
      expect(result.passed).toBe(true);
    });

    it("fails with non-matching URL", () => {
      const tpl = makeTemplate({ urlPattern: "https://pms.example.com/*" });
      const result = checkTemplateMatch(tpl, "https://evil-site.com/phishing");
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "url_matches")?.passed).toBe(false);
    });

    it("passes with matching window title", () => {
      const tpl = makeTemplate({ windowTitlePattern: "PMS System" });
      const result = checkTemplateMatch(tpl, undefined, "PMS System - Guest Check-in");
      expect(result.passed).toBe(true);
    });

    it("fails with non-matching window title", () => {
      const tpl = makeTemplate({ windowTitlePattern: "PMS System" });
      const result = checkTemplateMatch(tpl, undefined, "Browser Settings");
      expect(result.passed).toBe(false);
    });

    it("passes template with no URL pattern or window title pattern", () => {
      const tpl = makeTemplate();
      const result = checkTemplateMatch(tpl);
      expect(result.passed).toBe(true);
    });

    it("fails when URL pattern exists but current URL unavailable", () => {
      const tpl = makeTemplate({ urlPattern: "https://pms.example.com/*" });
      const result = checkTemplateMatch(tpl);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "url_matches")?.passed).toBe(false);
    });

    it("handles wildcard URL patterns correctly", () => {
      const tpl = makeTemplate({ urlPattern: "*.pms.example.com/*" });
      expect(checkTemplateMatch(tpl, "https://app.pms.example.com/checkin").passed).toBe(true);
      expect(checkTemplateMatch(tpl, "https://other.com").passed).toBe(false);
    });

    it("fails with no enabled mappings", () => {
      const tpl = makeTemplate();
      tpl.mappings = [
        {
          id: "m1",
          excelColumn: "fullName",
          targetFieldName: "Name",
          targetType: "copy",
          required: true,
          enabled: false,
        },
      ];
      const result = checkTemplateMatch(tpl, "https://pms.example.com");
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "has_mapped_fields")?.passed).toBe(false);
    });

    it("handles template with special regex characters in URL pattern", () => {
      const tpl = makeTemplate({ urlPattern: "https://pms.example.com/guest?type=1" });
      const result = checkTemplateMatch(tpl, "https://pms.example.com/guest?type=1");
      expect(result.passed).toBe(true);
    });
  });

  describe("auto-save safety", () => {
    it("passes for properly configured auto-save template", () => {
      const tpl = makeTemplate({ saveMode: "auto", autoSaveSelector: "#submit-btn" });
      const guest = makeGuest();
      const result = checkAutoSaveSafety(tpl, guest);
      expect(result.passed).toBe(true);
    });

    it("fails when template is in manual mode", () => {
      const tpl = makeTemplate({ saveMode: "manual" });
      const result = checkAutoSaveSafety(tpl, makeGuest());
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "auto_save_enabled")?.passed).toBe(false);
    });

    it("fails when auto-save selector is not configured", () => {
      const tpl = makeTemplate({ saveMode: "auto", autoSaveSelector: undefined });
      const result = checkAutoSaveSafety(tpl, makeGuest());
      expect(result.passed).toBe(false);
    });

    it("fails when required guest values are missing", () => {
      const tpl = makeTemplate({ saveMode: "auto", autoSaveSelector: "#save" });
      const guest = makeGuest({ fullName: "" });
      const result = checkAutoSaveSafety(tpl, guest);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === "required_values_exist")?.passed).toBe(false);
    });

    it("fails when guest has FAILED status", () => {
      const tpl = makeTemplate({ saveMode: "auto", autoSaveSelector: "#save" });
      const guest = makeGuest({ status: "FAILED" });
      const result = checkAutoSaveSafety(tpl, guest);
      expect(result.passed).toBe(false);
    });

    it("passes with autoSaveControlId instead of autoSaveSelector", () => {
      const tpl = makeTemplate({ saveMode: "auto", autoSaveSelector: undefined, autoSaveControlId: "btnSubmit" });
      const result = checkAutoSaveSafety(tpl, makeGuest());
      expect(result.passed).toBe(true);
    });
  });

  describe("mapped values validation", () => {
    it("passes when all mapped values exist", () => {
      const tpl = makeTemplate();
      const guest = makeGuest({ fullName: "Alice", passportNumber: "XY999999" });
      expect(checkMappedValuesExist(guest, tpl).passed).toBe(true);
    });

    it("fails when a mapped value is missing", () => {
      const tpl = makeTemplate();
      const guest = makeGuest({ fullName: "Alice", passportNumber: "" });
      const result = checkMappedValuesExist(guest, tpl);
      expect(result.passed).toBe(false);
    });

    it("skips disabled mappings", () => {
      const tpl = makeTemplate();
      tpl.mappings = [
        {
          id: "m1",
          excelColumn: "fullName",
          targetFieldName: "Name",
          targetType: "copy",
          required: true,
          enabled: true,
        },
        {
          id: "m2",
          excelColumn: "passportNumber",
          targetFieldName: "Passport",
          targetType: "copy",
          required: true,
          enabled: false,
        },
      ];
      const guest = makeGuest({ fullName: "Alice", passportNumber: "" });
      expect(checkMappedValuesExist(guest, tpl).passed).toBe(true);
    });
  });

  describe("confidence and accuracy pipeline", () => {
    it("rejects filling for low confidence guest", () => {
      const guest = makeGuest({ confidenceScore: 0.35, confidenceLevel: "LOW" });
      const confResult = checkConfidence(guest);
      expect(confResult.passed).toBe(false);
      expect(confResult.checks.find((c) => c.name === "high_confidence")?.message).toContain("35%");
    });

    it("passes high confidence guest through safety checks", () => {
      const guest = makeGuest({ confidenceScore: 0.95, confidenceLevel: "HIGH" });
      const confResult = checkConfidence(guest);
      expect(confResult.passed).toBe(true);
      const rowResult = checkGuestRow(guest);
      expect(rowResult.passed).toBe(true);
    });

    it("detects field accuracy issues for low quality data", () => {
      const guest = makeGuest({
        fullName: "12",
        passportNumber: "00000000",
        dateOfBirth: "2099-99-99",
      });
      const accResult = checkFieldAccuracy(guest);
      expect(accResult.passed).toBe(false);
      const digitsCheck = accResult.checks.find((c) => c.name === "field_fullName_digits");
      expect(digitsCheck?.passed).toBe(false);
    });

    it("generates per-field accuracy info with scores", () => {
      const guest = makeGuest({
        fullName: "Alice",
        passportNumber: "AB123456",
        gender: "F",
        nationality: "US",
        confidenceScore: 0.92,
        confidenceLevel: "HIGH",
      });
      const info = getFieldAccuracyInfo(guest);
      expect(info.length).toBeGreaterThanOrEqual(3);
      for (const item of info) {
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(["HIGH", "MEDIUM", "LOW"]).toContain(item.level);
      }
    });

    it("full accuracy pipeline: confidence + field accuracy + guest validation", () => {
      const goodGuest = makeGuest({
        fullName: "Valid Name",
        passportNumber: "XY999999",
        dateOfBirth: "1990-06-15",
        gender: "M",
        nationality: "US",
        confidenceScore: 0.95,
        confidenceLevel: "HIGH",
      });

      expect(checkConfidence(goodGuest).passed).toBe(true);
      expect(checkFieldAccuracy(goodGuest).passed).toBe(true);
      expect(checkGuestRow(goodGuest).passed).toBe(true);

      const badGuest = makeGuest({
        fullName: "A",
        passportNumber: "0",
        dateOfBirth: "2099-99-99",
        gender: "UNKNOWN",
        confidenceScore: 0.25,
        confidenceLevel: "LOW",
      });

      expect(checkConfidence(badGuest).passed).toBe(false);
      expect(checkFieldAccuracy(badGuest).passed).toBe(false);
      expect(checkGuestRow(badGuest).passed).toBe(true);
    });

    it("accuracy info surfaces actionable warnings", () => {
      const guest = makeGuest({
        fullName: "1",
        passportNumber: "00000000",
        nationality: "VN",
        issuingCountry: "CN",
      });
      const info = getFieldAccuracyInfo(guest);
      const nameIssues = info.find((i) => i.field === "fullName")?.issues;
      expect(nameIssues?.length).toBeGreaterThan(0);
      const passportIssues = info.find((i) => i.field === "passportNumber")?.issues;
      expect(passportIssues?.some((s) => s.toLowerCase().includes("zero"))).toBe(true);
    });

    it("extends safety checks with accuracy in auto-save flow", () => {
      const template = makeTemplate({ saveMode: "auto", autoSaveSelector: "#save-btn" });
      const lowConfGuest = makeGuest({ confidenceScore: 0.3, confidenceLevel: "LOW" });

      const autoSaveResult = checkAutoSaveSafety(template, lowConfGuest);
      const confResult = checkConfidence(lowConfGuest);

      expect(confResult.passed).toBe(false);
      expect(autoSaveResult.passed).toBe(true);
    });
  });

  describe("transform + safety combined pipeline", () => {
    it("applies transforms then validates safety for each field", () => {
      const guest = makeGuest({
        fullName: "  padding  ",
        dateOfBirth: "1990-06-15",
        gender: "M",
        nationality: "VN",
      });

      const transformed = {
        fullName: applyTransforms(guest.fullName, [{ type: "trim" }]),
        dateOfBirth: applyTransforms(guest.dateOfBirth ?? "", [
          { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
        ]),
        gender: applyTransforms(guest.gender ?? "", [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }]),
        nationality: applyTransforms(guest.nationality ?? "", [{ type: "country_format", format: "ISO3" }]),
      };

      expect(transformed.fullName).toBe("padding");
      expect(transformed.dateOfBirth).toBe("15/06/1990");
      expect(transformed.gender).toBe("Male");
      expect(transformed.nationality).toBe("VNM");

      const filledGuest = { ...guest, ...transformed } as GuestRow;
      const safetyResult = checkGuestRow(filledGuest);
      expect(safetyResult.passed).toBe(true);
    });

    it("detects failed transformation that empties a required field", () => {
      const guest = makeGuest({
        fullName: "  ",
        passportNumber: "AB123456",
      });

      const trimmed = applyTransforms(guest.fullName, [{ type: "trim" }]);
      const transformedGuest = { ...guest, fullName: trimmed };
      const result = checkGuestRow(transformedGuest);
      expect(result.passed).toBe(false);
    });

    it("validates all checks pass before allowing auto-fill", () => {
      const guest = makeGuest({
        fullName: "Alice Wong",
        passportNumber: "PW123456",
        nationality: "CN",
        gender: "F",
        dateOfBirth: "1992-08-20",
      });

      const tpl = makeTemplate({
        saveMode: "auto",
        autoSaveSelector: "#submit",
        urlPattern: "https://pms.example.com/*",
      });

      const templateMatch = checkTemplateMatch(tpl, "https://pms.example.com/checkin");
      expect(templateMatch.passed).toBe(true);

      const autoSaveSafety = checkAutoSaveSafety(tpl, guest);
      expect(autoSaveSafety.passed).toBe(true);

      const mappedValues = checkMappedValuesExist(guest, tpl);
      expect(mappedValues.passed).toBe(true);

      const guestSafety = checkGuestRow(guest);
      expect(guestSafety.passed).toBe(true);
    });
  });
});
