import { describe, it, expect } from "vitest";
import {
  getFieldValue,
  getFieldsInOrder,
  navigateField,
  navigateGuest,
  checkFieldAccuracyBeforeCopy,
  copyFieldWithWarning,
  getFieldAccuracyLevel,
  getAccuracySummary,
  getQuickFixesForField,
  getHighConfidenceFields,
  getMediumConfidenceFields,
  getBatchCopyPreview,
} from "../../../features/fill/copyAssistant";
import type { GuestRow } from "@guestfill/shared";

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

describe("copyAssistant", () => {
  describe("getFieldValue", () => {
    it("returns field value from guest", () => {
      const guest = createGuest();
      expect(getFieldValue(guest, "fullName")).toBe("John Doe");
    });

    it("returns empty string for undefined field", () => {
      const guest = createGuest();
      expect(getFieldValue(guest, "nonexistent" as keyof GuestRow)).toBe("");
    });

    it("returns empty string for null field", () => {
      const guest = createGuest({ roomNumber: undefined });
      expect(getFieldValue(guest, "roomNumber")).toBe("");
    });
  });

  describe("getFieldsInOrder", () => {
    it("returns fields in default order", () => {
      const guest = createGuest();
      const fields = getFieldsInOrder(guest);
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0]?.key).toBe("fullName");
      expect(fields[0]?.label).toBe("Full Name");
      expect(fields[0]?.value).toBe("John Doe");
    });

    it("respects custom field order", () => {
      const guest = createGuest();
      const fields = getFieldsInOrder(guest, ["nationality", "fullName"]);
      expect(fields[0]?.key).toBe("nationality");
      expect(fields[1]?.key).toBe("fullName");
    });

    it("filters out non-existent fields", () => {
      const guest = createGuest();
      const fields = getFieldsInOrder(guest, ["fullName", "nonexistent" as keyof GuestRow]);
      expect(fields).toHaveLength(1);
    });
  });

  describe("navigateField", () => {
    it("navigates to next field", () => {
      expect(navigateField(0, 5, "next")).toBe(1);
    });

    it("clamps to last field when navigating next from last", () => {
      expect(navigateField(4, 5, "next")).toBe(4);
    });

    it("navigates to previous field", () => {
      expect(navigateField(2, 5, "prev")).toBe(1);
    });

    it("clamps to first field when navigating prev from first", () => {
      expect(navigateField(0, 5, "prev")).toBe(0);
    });
  });

  describe("navigateGuest", () => {
    it("navigates to next guest", () => {
      expect(navigateGuest(0, 5, "next")).toBe(1);
    });

    it("clamps to last guest", () => {
      expect(navigateGuest(4, 5, "next")).toBe(4);
    });

    it("navigates to previous guest", () => {
      expect(navigateGuest(2, 5, "prev")).toBe(1);
    });

    it("clamps to first guest", () => {
      expect(navigateGuest(0, 5, "prev")).toBe(0);
    });
  });

  describe("checkFieldAccuracyBeforeCopy", () => {
    it("passes for high accuracy field", () => {
      const guest = createGuest();
      const result = checkFieldAccuracyBeforeCopy(guest, "fullName");
      expect(result.success).toBe(true);
      expect(result.level).toBe("HIGH");
    });

    it("fails for low accuracy field", () => {
      const guest = createGuest({ fullName: "A" });
      const result = checkFieldAccuracyBeforeCopy(guest, "fullName");
      expect(result.success).toBe(false);
      expect(result.level).toBe("LOW");
    });

    it("returns HIGH for unknown field", () => {
      const guest = createGuest();
      const result = checkFieldAccuracyBeforeCopy(guest, "roomNumber" as keyof GuestRow);
      expect(result.success).toBe(true);
      expect(result.level).toBe("HIGH");
    });

    it("includes recommendations for low accuracy", () => {
      const guest = createGuest({ fullName: "A" });
      const result = checkFieldAccuracyBeforeCopy(guest, "fullName");
      if (!result.success) {
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("copyFieldWithWarning", () => {
    it("returns success for high accuracy field", () => {
      const guest = createGuest();
      const result = copyFieldWithWarning(guest, "fullName");
      expect(result.success).toBe(true);
    });

    it("returns warning for low accuracy field", () => {
      const guest = createGuest({ fullName: "A" });
      const result = copyFieldWithWarning(guest, "fullName");
      expect(result.success).toBe(false);
      expect(result.warning).toContain("Low accuracy");
    });
  });

  describe("getFieldAccuracyLevel", () => {
    it("returns level for known field", () => {
      const guest = createGuest();
      const result = getFieldAccuracyLevel(guest, "fullName");
      expect(result.level).toBe("HIGH");
      expect(result.score).toBeGreaterThan(0);
    });

    it("returns HIGH for unknown field", () => {
      const guest = createGuest();
      const result = getFieldAccuracyLevel(guest, "roomNumber" as keyof GuestRow);
      expect(result.level).toBe("HIGH");
      expect(result.score).toBe(1.0);
    });

    it("includes recommendations for low accuracy fields", () => {
      const guest = createGuest({ fullName: "A" });
      const result = getFieldAccuracyLevel(guest, "fullName");
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("getAccuracySummary", () => {
    it("returns summary with overall score and level", () => {
      const guest = createGuest();
      const summary = getAccuracySummary(guest);
      expect(summary.overallScore).toBeGreaterThanOrEqual(0);
      expect(summary.overallLevel).toBeDefined();
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(summary.overallLevel);
    });

    it("includes medium confidence count", () => {
      const guest = createGuest({ fullName: "A" });
      const summary = getAccuracySummary(guest);
      expect(summary.mediumConfidence).toBeGreaterThanOrEqual(0);
    });

    it("includes recommendations when issues exist", () => {
      const guest = createGuest({
        fullName: "A",
        passportNumber: "0000",
        nationality: "VN",
      });
      const summary = getAccuracySummary(guest);
      expect(summary.recommendations.length).toBeGreaterThan(0);
    });

    it("returns zero warnings for clean data", () => {
      const guest = createGuest();
      const summary = getAccuracySummary(guest);
      expect(summary.warnings.length).toBe(0);
    });
  });

  describe("getQuickFixesForField", () => {
    it("returns digit-removal fix for name containing digits", () => {
      const guest = createGuest({ fullName: "John123" });
      const fixes = getQuickFixesForField(guest, "fullName");
      expect(fixes.length).toBeGreaterThan(0);
      const digitFix = fixes.find((f) => f.action === "replace" && f.label.includes("digit"));
      expect(digitFix).toBeDefined();
      expect(digitFix?.value).toBe("John");
    });

    it("returns OCR ambiguity fix for passport number with ambiguous char", () => {
      const guest = createGuest({ passportNumber: "AB0CD" });
      const fixes = getQuickFixesForField(guest, "passportNumber");
      expect(fixes.length).toBeGreaterThan(0);
      const charFix = fixes.find((f) => f.action === "replace" && f.label.includes("0"));
      expect(charFix).toBeDefined();
      expect(charFix?.description).toContain("Position");
    });

    it("returns zero-filled flag for all-zero passport number", () => {
      const guest = createGuest({ passportNumber: "000000000" });
      const fixes = getQuickFixesForField(guest, "passportNumber");
      const zeroFix = fixes.find((f) => f.description.includes("placeholder"));
      expect(zeroFix).toBeDefined();
      expect(zeroFix?.action).toBe("review");
    });

    it("returns country pattern fix for nationality mismatch", () => {
      const guest = createGuest({ passportNumber: "AB12", nationality: "GBR" });
      const fixes = getQuickFixesForField(guest, "passportNumber");
      const patternFix = fixes.find((f) => f.label.includes("GBR"));
      expect(patternFix).toBeDefined();
    });

    it("returns format suggestions for unparseable compact date", () => {
      const guest = createGuest({ dateOfBirth: "19900101" });
      const fixes = getQuickFixesForField(guest, "dateOfBirth");
      const dateFix = fixes.find((f) => f.action === "replace" && f.label.includes("formatted"));
      expect(dateFix).toBeDefined();
      expect(dateFix?.value).toBe("01/01/1990");
    });

    it("returns gender conversion fix for 'Male' value", () => {
      const guest = createGuest({ gender: "Male" as unknown as "M" | "F" | "UNKNOWN" });
      const fixes = getQuickFixesForField(guest, "gender");
      const genderFix = fixes.find((f) => f.action === "replace" && f.value === "M");
      expect(genderFix).toBeDefined();
    });

    it("returns ISO3 conversion fix for 2-letter nationality", () => {
      const guest = createGuest({ nationality: "VN" });
      const fixes = getQuickFixesForField(guest, "nationality");
      const isoFix = fixes.find((f) => f.action === "replace" && f.value === "VNM");
      expect(isoFix).toBeDefined();
    });

    it("returns empty array for clean data", () => {
      const guest = createGuest();
      const fixes = getQuickFixesForField(guest, "fullName");
      expect(fixes.length).toBe(0);
    });

    it("limits to max 5 quick fixes", () => {
      const guest = createGuest({ passportNumber: "0O1I5S8B2Z6G" });
      const fixes = getQuickFixesForField(guest, "passportNumber");
      expect(fixes.length).toBeLessThanOrEqual(5);
    });

    it("includes quickFixes in checkFieldAccuracyBeforeCopy result", () => {
      const guest = createGuest({ fullName: "John123" });
      const result = checkFieldAccuracyBeforeCopy(guest, "fullName");
      expect(result.quickFixes).toBeDefined();
      expect(result.quickFixes!.length).toBeGreaterThan(0);
    });

    it("includes quickFixes in getFieldAccuracyLevel result", () => {
      const guest = createGuest({ passportNumber: "AB0CD" });
      const result = getFieldAccuracyLevel(guest, "passportNumber");
      expect(result.quickFixes).toBeDefined();
    });

    it("returns empty quickFixes for high-accuracy field", () => {
      const guest = createGuest();
      const result = checkFieldAccuracyBeforeCopy(guest, "fullName");
      expect(result.quickFixes).toEqual([]);
    });
  });

  describe("getHighConfidenceFields", () => {
    it("returns high confidence fields for clean guest", () => {
      const guest = createGuest();
      const fields = getHighConfidenceFields(guest);
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).toContain("fullName");
      expect(fields).toContain("passportNumber");
    });

    it("excludes empty fields", () => {
      const guest = createGuest({ roomNumber: "" });
      const fields = getHighConfidenceFields(guest);
      expect(fields).not.toContain("roomNumber");
    });

    it("excludes low accuracy fields", () => {
      const guest = createGuest({ fullName: "A" });
      const fields = getHighConfidenceFields(guest);
      expect(fields).not.toContain("fullName");
    });
  });

  describe("getMediumConfidenceFields", () => {
    it("returns medium confidence fields", () => {
      const guest = createGuest({ fullName: "AB" });
      const fields = getMediumConfidenceFields(guest);
      expect(fields).toContain("fullName");
    });

    it("returns empty for clean data", () => {
      const guest = createGuest();
      const fields = getMediumConfidenceFields(guest);
      expect(fields.length).toBe(0);
    });
  });

  describe("getBatchCopyPreview", () => {
    it("groups fields by confidence level", () => {
      const guest = createGuest();
      const preview = getBatchCopyPreview(guest);
      expect(preview.highConfidence.length).toBeGreaterThan(0);
      expect(preview.totalFields).toBeGreaterThan(0);
    });

    it("identifies low confidence fields", () => {
      const guest = createGuest({
        fullName: "A",
        passportNumber: "0000",
        dateOfBirth: "invalid-date",
      });
      const preview = getBatchCopyPreview(guest);
      expect(preview.lowConfidence.length).toBeGreaterThan(0);
    });

    it("shows correct field count", () => {
      const guest = createGuest();
      const preview = getBatchCopyPreview(guest);
      expect(
        preview.highConfidence.length + preview.mediumConfidence.length + preview.lowConfidence.length,
      ).toBeLessThanOrEqual(preview.totalFields);
    });
  });
});
