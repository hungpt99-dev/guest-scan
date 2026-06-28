import { describe, it, expect, beforeEach } from "vitest";
import type { GuestRow, TargetSystemTemplate } from "@guestfill/shared";
import { applyTransforms } from "../../../features/fill/transformEngine";
import {
  checkGuestRow,
  checkAutoSaveSafety,
  checkConfidence,
  checkFieldAccuracy,
} from "../../../features/fill/safetyEngine";
import {
  getFieldValue,
  getFieldsInOrder,
  navigateField,
  navigateGuest,
  getAccuracySummary,
  getFieldAccuracyLevel,
} from "../../../features/fill/copyAssistant";
import { createDefaultTemplate } from "../../../features/fill/templateManager";

describe("Fill Workflow Integration", () => {
  let guest: GuestRow;
  let template: TargetSystemTemplate;

  beforeEach(() => {
    guest = {
      id: "guest-1",
      sessionId: "session-1",
      rowId: "row-1",
      fullName: "John Doe",
      surname: "Doe",
      givenName: "John",
      passportNumber: "AB123456",
      idNumber: "",
      nationality: "USA",
      dateOfBirth: "1990-06-15",
      gender: "M",
      passportExpiryDate: "2030-12-31",
      documentType: "PASSPORT",
      status: "READY",
      fillStatus: "PENDING",
      confidenceScore: 0.95,
      confidenceLevel: "HIGH",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    template = createDefaultTemplate("Hotel PMS");
    template.mappings = [
      {
        id: "m1",
        excelColumn: "fullName",
        targetFieldName: "Guest Name",
        targetType: "copy",
        required: true,
        enabled: true,
      },
      {
        id: "m2",
        excelColumn: "passportNumber",
        targetFieldName: "Passport No",
        targetType: "copy",
        required: true,
        enabled: true,
      },
      {
        id: "m3",
        excelColumn: "dateOfBirth",
        targetFieldName: "DOB",
        targetType: "copy",
        required: true,
        enabled: true,
        transform: [{ type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" }],
      },
      {
        id: "m4",
        excelColumn: "nationality",
        targetFieldName: "Nationality",
        targetType: "copy",
        required: false,
        enabled: true,
        transform: [{ type: "country_format", format: "ISO3" }],
      },
      {
        id: "m5",
        excelColumn: "gender",
        targetFieldName: "Gender",
        targetType: "copy",
        required: true,
        enabled: true,
        transform: [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }],
      },
    ];
  });

  it("completes a full fill workflow: import -> review -> copy -> mark filled", () => {
    // Step 1: Validate guest row is ready for filling
    const safetyResult = checkGuestRow(guest);
    expect(safetyResult.passed).toBe(true);

    // Step 2: Get fields in order
    const fields = getFieldsInOrder(guest);
    expect(fields.length).toBeGreaterThan(0);
    const fullNameField = fields.find((f) => f.key === "fullName");
    expect(fullNameField?.value).toBe("John Doe");

    // Step 3: Navigate through fields
    let idx = navigateField(0, fields.length, "next");
    expect(idx).toBe(1);
    idx = navigateField(idx, fields.length, "next");
    expect(idx).toBe(2);
    idx = navigateField(idx, fields.length, "prev");
    expect(idx).toBe(1);

    // Step 4: Get field values
    expect(getFieldValue(guest, "fullName")).toBe("John Doe");
    expect(getFieldValue(guest, "passportNumber")).toBe("AB123456");

    // Step 5: Apply transforms for each mapping
    for (const mapping of template.mappings) {
      const raw = getFieldValue(guest, mapping.excelColumn);
      const transformed = mapping.transform ? applyTransforms(raw, mapping.transform) : raw;
      expect(transformed).toBeTruthy();
    }

    // Step 6: Verify date format transform
    const dobMapping = template.mappings.find((m) => m.excelColumn === "dateOfBirth");
    expect(applyTransforms("1990-06-15", dobMapping!.transform ?? [])).toBe("15/06/1990");

    // Step 7: Verify gender transform
    const genderMapping = template.mappings.find((m) => m.excelColumn === "gender");
    expect(applyTransforms("M", genderMapping!.transform ?? [])).toBe("Male");

    // Step 8: Verify country transform
    const nationalityMapping = template.mappings.find((m) => m.excelColumn === "nationality");
    expect(applyTransforms("USA", nationalityMapping!.transform ?? [])).toBe("USA");

    // Step 9: Mark as filled
    guest.fillStatus = "FILLED";
    guest.updatedAt = new Date().toISOString();
    expect(guest.fillStatus).toBe("FILLED");
  });

  it("prevents filling when safety checks fail", () => {
    const invalidGuest: GuestRow = { ...guest, fullName: "" };
    const result = checkGuestRow(invalidGuest);
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "required_fields_exist")?.passed).toBe(false);
  });

  it("validates template configuration before auto-save", () => {
    const autoTemplate: TargetSystemTemplate = {
      ...template,
      saveMode: "auto",
      autoSaveSelector: "#submit-btn",
    };
    const result = checkAutoSaveSafety(autoTemplate, guest);
    expect(result.passed).toBe(true);
  });

  it("rejects auto-save when template is manual mode", () => {
    const manualTemplate: TargetSystemTemplate = {
      ...template,
      saveMode: "manual",
    };
    const result = checkAutoSaveSafety(manualTemplate, guest);
    expect(result.passed).toBe(false);
  });

  it("navigates between guests in a workflow", () => {
    const totalGuests = 3;
    let idx = navigateGuest(0, totalGuests, "next");
    expect(idx).toBe(1);
    idx = navigateGuest(idx, totalGuests, "next");
    expect(idx).toBe(2);
    idx = navigateGuest(idx, totalGuests, "next");
    expect(idx).toBe(2);
    idx = navigateGuest(idx, totalGuests, "prev");
    expect(idx).toBe(1);
    idx = navigateGuest(idx, totalGuests, "prev");
    expect(idx).toBe(0);
    idx = navigateGuest(idx, totalGuests, "prev");
    expect(idx).toBe(0);
  });

  it("gates filling on confidence score", () => {
    const highConf: GuestRow = { ...guest, confidenceScore: 0.95, confidenceLevel: "HIGH" };
    expect(checkConfidence(highConf).passed).toBe(true);

    const lowConf: GuestRow = { ...guest, confidenceScore: 0.35, confidenceLevel: "LOW" };
    expect(checkConfidence(lowConf).passed).toBe(false);
  });

  it("requires field accuracy for safe filling", () => {
    const validGuest: GuestRow = { ...guest, fullName: "John Doe", passportNumber: "AB123456" };
    expect(checkFieldAccuracy(validGuest).passed).toBe(true);

    const invalidGuest: GuestRow = { ...guest, fullName: "A", passportNumber: "0" };
    expect(checkFieldAccuracy(invalidGuest).passed).toBe(false);
  });

  it("provides accuracy summary for workflow decisions", () => {
    const goodGuest: GuestRow = { ...guest, confidenceScore: 0.95, confidenceLevel: "HIGH" };
    const summary = getAccuracySummary(goodGuest);
    expect(summary.totalFields).toBeGreaterThan(0);
    expect(summary.warnings.length).toBe(0);

    const badGuest: GuestRow = {
      ...guest,
      fullName: "A",
      passportNumber: "0000",
      gender: "UNKNOWN",
      confidenceScore: 0.3,
      confidenceLevel: "LOW",
    };
    const badSummary = getAccuracySummary(badGuest);
    expect(badSummary.warnings.length).toBeGreaterThan(0);
  });

  it("gets per-field accuracy level", () => {
    const result = getFieldAccuracyLevel(guest, "fullName");
    expect(result.level).toBe("HIGH");
    expect(result.score).toBe(1.0);
  });

  it("includes accuracy info in field listing", () => {
    const fields = getFieldsInOrder(guest);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields[0]?.accuracyLevel).toBeDefined();
    expect(fields[0]?.accuracyScore).toBeDefined();
  });

  it("applies full pipeline: import -> normalize -> validate -> fill", () => {
    // Simulate Excel imported guest with raw data
    const rawGuest: GuestRow = {
      ...guest,
      fullName: "  Jane Smith  ",
      nationality: "VN",
      gender: "F",
      dateOfBirth: "1995-12-25",
    };

    // Validate
    expect(rawGuest.fullName.trim()).toBe("Jane Smith");

    // Apply all transforms
    const transformedGuest = {
      fullName: applyTransforms(rawGuest.fullName, [{ type: "trim" }]),
      nationality: applyTransforms(rawGuest.nationality ?? "", [{ type: "country_format", format: "ISO3" }]),
      gender: applyTransforms(rawGuest.gender ?? "", [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }]),
      dateOfBirth: applyTransforms(rawGuest.dateOfBirth ?? "", [
        { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
      ]),
    };

    expect(transformedGuest.fullName).toBe("Jane Smith");
    expect(transformedGuest.nationality).toBe("VNM");
    expect(transformedGuest.gender).toBe("Female");
    expect(transformedGuest.dateOfBirth).toBe("25/12/1995");
  });
});
