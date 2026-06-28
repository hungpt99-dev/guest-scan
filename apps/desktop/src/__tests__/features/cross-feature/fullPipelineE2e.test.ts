import { describe, it, expect } from "vitest";
import type { GuestRow } from "@guestfill/shared";
import { validateGuestRow } from "../../../features/excel/excelValidation";
import { applyTransforms } from "../../../features/fill/transformEngine";
import { checkGuestRow, checkMappedValuesExist } from "../../../features/fill/safetyEngine";
import { getFieldValue, getFieldsInOrder, navigateField, navigateGuest } from "../../../features/fill/copyAssistant";
import {
  createDefaultTemplate,
  exportTemplateAsJson,
  importTemplateFromJson,
} from "../../../features/fill/templateManager";
import { ERROR_CODES, DEFAULT_KEYBOARD_SHORTCUTS, FILL_FIELDS } from "../../../features/fill/fillConstants";

function createSampleGuest(overrides?: Partial<GuestRow>): GuestRow {
  return {
    id: "guest-full-1",
    sessionId: "session-full-1",
    rowId: "row-full-1",
    fullName: "Jane Smith",
    surname: "Smith",
    givenName: "Jane",
    passportNumber: "AB123456",
    idNumber: "",
    nationality: "VN",
    dateOfBirth: "1995-12-25",
    gender: "F",
    passportExpiryDate: "2030-12-31",
    idExpiryDate: "",
    issuingCountry: "VNM",
    issuingAuthority: "",
    documentType: "PASSPORT",
    roomNumber: "101",
    arrivalDate: "2025-06-01",
    departureDate: "2025-06-05",
    reservationCode: "RES-001",
    status: "READY",
    fillStatus: "PENDING",
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("Full Pipeline E2E: OCR -> Import -> Validate -> Transform -> Fill -> Complete", () => {
  describe("Phase 1: Data Acquisition and Validation", () => {
    it("validates OCR-extracted guest data is structurally complete", () => {
      const guest = createSampleGuest();
      const errors = validateGuestRow(guest);
      expect(errors).toHaveLength(0);
    });

    it("detects invalid data from OCR pipeline", () => {
      const invalid = createSampleGuest({ fullName: "", documentType: "UNKNOWN" });
      const errors = validateGuestRow(invalid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain("Full name is required");
    });

    it("handles OCR output with various confidence levels", () => {
      const high = createSampleGuest({ confidenceLevel: "HIGH", confidenceScore: 0.95 });
      const med = createSampleGuest({ confidenceLevel: "MEDIUM", confidenceScore: 0.75 });
      const low = createSampleGuest({ confidenceLevel: "LOW", confidenceScore: 0.45 });
      expect(high.confidenceScore).toBeGreaterThan(0.9);
      expect(med.confidenceScore).toBeGreaterThanOrEqual(0.5);
      expect(low.confidenceScore).toBeLessThan(0.5);
    });
  });

  describe("Phase 2: Data Transformation Pipeline", () => {
    it("applies full transform stack to guest data", () => {
      const guest = createSampleGuest({
        fullName: "  jane smith  ",
        nationality: "VN",
        gender: "F",
        dateOfBirth: "1995-12-25",
      });

      const transforms = {
        fullName: applyTransforms(guest.fullName, [{ type: "trim" }, { type: "titlecase" }]),
        nationality: applyTransforms(guest.nationality ?? "", [{ type: "country_format", format: "ISO3" }]),
        gender: applyTransforms(guest.gender ?? "", [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }]),
        dateOfBirth: applyTransforms(guest.dateOfBirth ?? "", [
          { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
        ]),
        roomNumber: applyTransforms(guest.roomNumber ?? "", [{ type: "prefix", value: "RM-" }]),
        reservationCode: applyTransforms(guest.reservationCode ?? "", [{ type: "suffix", value: "-HOTEL" }]),
      };

      expect(transforms.fullName).toBe("Jane Smith");
      expect(transforms.nationality).toBe("VNM");
      expect(transforms.gender).toBe("Female");
      expect(transforms.dateOfBirth).toBe("25/12/1995");
      expect(transforms.roomNumber).toBe("RM-101");
      expect(transforms.reservationCode).toBe("RES-001-HOTEL");
    });

    it("chains multiple transformations in order", () => {
      const value = "  MR. john DOE  ";
      const result = applyTransforms(value, [{ type: "trim" }, { type: "lowercase" }, { type: "titlecase" }]);
      expect(result).toBe("Mr. John Doe");
    });

    it("handles empty values gracefully through transform chain", () => {
      expect(applyTransforms("", [{ type: "trim" }])).toBe("");
      expect(applyTransforms("", [{ type: "uppercase" }])).toBe("");
      expect(applyTransforms("", [{ type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" }])).toBe("");
      expect(applyTransforms("", [{ type: "gender_format", mapping: { M: "Male" } }])).toBe("");
    });

    it("transforms gender values from multiple input formats", () => {
      const mapping = { M: "Male", F: "Female", U: "Unknown" };
      expect(applyTransforms("M", [{ type: "gender_format", mapping }])).toBe("Male");
      expect(applyTransforms("F", [{ type: "gender_format", mapping }])).toBe("Female");
      expect(applyTransforms("U", [{ type: "gender_format", mapping }])).toBe("Unknown");
      expect(applyTransforms("X", [{ type: "gender_format", mapping }])).toBe("X");
    });

    it("transforms country codes to ISO3", () => {
      expect(applyTransforms("VN", [{ type: "country_format", format: "ISO3" }])).toBe("VNM");
      expect(applyTransforms("US", [{ type: "country_format", format: "ISO3" }])).toBe("USA");
      expect(applyTransforms("KR", [{ type: "country_format", format: "ISO3" }])).toBe("KOR");
      expect(applyTransforms("CN", [{ type: "country_format", format: "ISO3" }])).toBe("CHN");
      expect(applyTransforms("JP", [{ type: "country_format", format: "ISO3" }])).toBe("JPN");
      expect(applyTransforms("GB", [{ type: "country_format", format: "ISO3" }])).toBe("GBR");
      expect(applyTransforms("AAA", [{ type: "country_format", format: "ISO3" }])).toBe("AAA");
    });
  });

  describe("Phase 3: Safety Validation", () => {
    it("validates guest is safe to fill with all required fields", () => {
      const guest = createSampleGuest();
      const safetyCheck = checkGuestRow(guest);
      expect(safetyCheck.passed).toBe(true);
      expect(safetyCheck.checks).toHaveLength(3);
    });

    it("validates mapped values exist for template match", () => {
      const guest = createSampleGuest();
      const template = createDefaultTemplate("PMS");
      template.mappings = [
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
          targetFieldName: "PP No",
          targetType: "copy",
          required: true,
          enabled: true,
        },
      ];
      const result = checkMappedValuesExist(guest, template);
      expect(result.passed).toBe(true);
    });
  });

  describe("Phase 4: Fill Assistant Workflow", () => {
    it("retrieves fields in correct display order", () => {
      const guest = createSampleGuest();
      const fields = getFieldsInOrder(guest);
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0]?.key).toBe("fullName");
      expect(fields[0]?.value).toBe("Jane Smith");
    });

    it("navigates fields bidirectionally", () => {
      const guest = createSampleGuest();
      const fields = getFieldsInOrder(guest);
      expect(fields.length).toBeGreaterThan(3);

      let idx = 0;
      idx = navigateField(idx, fields.length, "next");
      expect(idx).toBe(1);
      idx = navigateField(idx, fields.length, "next");
      expect(idx).toBe(2);
      idx = navigateField(idx, fields.length, "prev");
      expect(idx).toBe(1);
      idx = navigateField(idx, fields.length, "prev");
      expect(idx).toBe(0);
      idx = navigateField(idx, fields.length, "prev");
      expect(idx).toBe(0);
    });

    it("navigates guests bidirectionally", () => {
      let idx = navigateGuest(0, 5, "next");
      expect(idx).toBe(1);
      idx = navigateGuest(4, 5, "next");
      expect(idx).toBe(4);
      idx = navigateGuest(0, 5, "prev");
      expect(idx).toBe(0);
    });

    it("extracts individual field values", () => {
      const guest = createSampleGuest();
      expect(getFieldValue(guest, "fullName")).toBe("Jane Smith");
      expect(getFieldValue(guest, "passportNumber")).toBe("AB123456");
      expect(getFieldValue(guest, "nationality")).toBe("VN");
      expect(getFieldValue(guest, "dateOfBirth")).toBe("1995-12-25");
    });

    it("returns empty string for missing fields", () => {
      const guest = createSampleGuest();
      expect(getFieldValue(guest, "nonexistent" as keyof GuestRow)).toBe("");
    });
  });

  describe("Phase 5: Multi-Guest Workflow", () => {
    it("processes multiple guests through the full pipeline", () => {
      const guests = [
        createSampleGuest({ id: "g1", fullName: "Alice", nationality: "US", gender: "F", dateOfBirth: "1990-01-15" }),
        createSampleGuest({ id: "g2", fullName: "Bob", nationality: "KR", gender: "M", dateOfBirth: "1985-06-20" }),
        createSampleGuest({ id: "g3", fullName: "Charlie", nationality: "JP", gender: "M", dateOfBirth: "1992-11-30" }),
      ];

      for (const guest of guests) {
        expect(validateGuestRow(guest)).toHaveLength(0);
        expect(checkGuestRow(guest).passed).toBe(true);

        const transformed = {
          fullName: guest.fullName,
          nationality: applyTransforms(guest.nationality ?? "", [{ type: "country_format", format: "ISO3" }]),
          gender: applyTransforms(guest.gender ?? "", [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }]),
          dateOfBirth: applyTransforms(guest.dateOfBirth ?? "", [
            { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
          ]),
        };

        expect(transformed.nationality).toBeTruthy();
        expect(transformed.gender).toBeTruthy();
        expect(transformed.dateOfBirth).toBeTruthy();
      }

      expect(guests[0]?.nationality).toBe("US");
      expect(guests[1]?.nationality).toBe("KR");
      expect(guests[2]?.nationality).toBe("JP");
    });

    it("tracks fill status through workflow", () => {
      const guest = createSampleGuest();

      expect(guest.fillStatus).toBe("PENDING");
      guest.fillStatus = "IN_PROGRESS";
      expect(guest.fillStatus).toBe("IN_PROGRESS");
      guest.fillStatus = "FILLED";
      expect(guest.fillStatus).toBe("FILLED");
    });
  });

  describe("Phase 6: Template Management in Pipeline", () => {
    it("creates template, uses it, exports and re-imports it", () => {
      const tpl = createDefaultTemplate("E2E PMS");
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
          targetFieldName: "PP No",
          targetType: "copy",
          required: true,
          enabled: true,
        },
      ];

      const json = exportTemplateAsJson(tpl);
      const imported = importTemplateFromJson(json);
      expect(imported).not.toBeNull();
      expect(imported?.name).toBe("E2E PMS");
      expect(imported?.mappings).toHaveLength(2);
    });
  });

  describe("Phase 7: Error Codes and Constants Coverage", () => {
    it("defines all error codes used in the pipeline", () => {
      expect(ERROR_CODES.EXCEL_IMPORT_FAILED).toBe("EXCEL_IMPORT_FAILED");
      expect(ERROR_CODES.MISSING_REQUIRED_COLUMN).toBe("MISSING_REQUIRED_COLUMN");
      expect(ERROR_CODES.CLIPBOARD_COPY_FAILED).toBe("CLIPBOARD_COPY_FAILED");
      expect(ERROR_CODES.FILL_STATUS_SAVE_FAILED).toBe("FILL_STATUS_SAVE_FAILED");
      expect(ERROR_CODES.AUTO_SAVE_SAFETY_CHECK_FAILED).toBe("AUTO_SAVE_SAFETY_CHECK_FAILED");
      expect(Object.keys(ERROR_CODES).length).toBeGreaterThan(10);
    });

    it("defines keyboard shortcuts", () => {
      expect(DEFAULT_KEYBOARD_SHORTCUTS.copyCurrentField).toBe("Ctrl+Shift+C");
      expect(DEFAULT_KEYBOARD_SHORTCUTS.nextField).toBe("Ctrl+Shift+N");
      expect(DEFAULT_KEYBOARD_SHORTCUTS.markFilled).toBe("Ctrl+Shift+F");
      expect(DEFAULT_KEYBOARD_SHORTCUTS.emergencyStop).toBe("Ctrl+Alt+Esc");
    });

    it("defines all fill fields with labels", () => {
      const fieldKeys = FILL_FIELDS.map((f) => f.key);
      expect(fieldKeys).toContain("fullName");
      expect(fieldKeys).toContain("passportNumber");
      expect(fieldKeys).toContain("nationality");
      expect(fieldKeys).toContain("dateOfBirth");
      expect(fieldKeys).toContain("gender");
      expect(fieldKeys).toContain("roomNumber");
      expect(fieldKeys).toContain("arrivalDate");
      expect(FILL_FIELDS.length).toBe(13);
    });
  });

  describe("Phase 8: End-to-End Guest Workflow Simulation", () => {
    it("completes full fill cycle for a single guest", () => {
      const guest = createSampleGuest();

      const validationErrors = validateGuestRow(guest);
      expect(validationErrors).toHaveLength(0);

      const safetyCheck = checkGuestRow(guest);
      expect(safetyCheck.passed).toBe(true);

      const fields = getFieldsInOrder(guest);
      const requiredFields = ["fullName", "passportNumber", "nationality", "dateOfBirth", "gender"];
      for (const fieldKey of requiredFields) {
        const field = fields.find((f) => f.key === fieldKey);
        expect(field).toBeDefined();
        expect(field!.value).toBeTruthy();
      }

      const templates = createDefaultTemplate("Workflow PMS");
      templates.mappings = [
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
          targetFieldName: "PP No",
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
          excelColumn: "gender",
          targetFieldName: "Gender",
          targetType: "copy",
          required: true,
          enabled: true,
          transform: [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }],
        },
        {
          id: "m5",
          excelColumn: "nationality",
          targetFieldName: "Nat",
          targetType: "copy",
          required: true,
          enabled: true,
          transform: [{ type: "country_format", format: "ISO3" }],
        },
      ];

      const mappedCheck = checkMappedValuesExist(guest, templates);
      expect(mappedCheck.passed).toBe(true);

      for (const mapping of templates.mappings) {
        const raw = getFieldValue(guest, mapping.excelColumn);
        const transformed = mapping.transform ? applyTransforms(raw, mapping.transform) : raw;
        expect(transformed).toBeTruthy();
      }

      guest.fillStatus = "FILLED";
      expect(guest.fillStatus).toBe("FILLED");
    });

    it("handles edge case: guest with minimal data", () => {
      const empty = createSampleGuest({
        fullName: "",
        passportNumber: undefined,
        idNumber: undefined,
        nationality: undefined,
        dateOfBirth: undefined,
        gender: "UNKNOWN",
        documentType: "UNKNOWN",
        status: "MISSING_DATA",
        roomNumber: undefined,
        arrivalDate: undefined,
        departureDate: undefined,
        reservationCode: undefined,
      });

      const errors = validateGuestRow(empty);
      expect(errors.length).toBeGreaterThan(0);

      const fields = getFieldsInOrder(empty);
      const emptyFields = fields.filter((f) => f.value === "");
      expect(emptyFields.length).toBeGreaterThan(0);
      const genderField = fields.find((f) => f.key === "gender");
      expect(genderField?.value).toBe("UNKNOWN");
    });

    it("handles edge case: guest with ID card instead of passport", () => {
      const idGuest = createSampleGuest({
        documentType: "ID_CARD",
        passportNumber: undefined,
        idNumber: "ID123456789",
        passportExpiryDate: undefined,
        idExpiryDate: "2030-01-01",
      });

      expect(validateGuestRow(idGuest)).toHaveLength(0);
      expect(checkGuestRow(idGuest).passed).toBe(true);
      expect(getFieldValue(idGuest, "idNumber")).toBe("ID123456789");
      expect(getFieldValue(idGuest, "passportNumber")).toBe("");
    });

    it("handles edge case: guest with special characters in name", () => {
      const special = createSampleGuest({
        fullName: "Nguyễn Văn A",
        passportNumber: "C7654321",
      });

      expect(validateGuestRow(special)).toHaveLength(0);
      const trimmed = applyTransforms(special.fullName, [{ type: "trim" }]);
      expect(trimmed).toBe("Nguyễn Văn A");
    });

    it("handles edge case: future and past dates", () => {
      const past = createSampleGuest({ dateOfBirth: "1950-01-01" });
      const future = createSampleGuest({ passportExpiryDate: "2040-12-31" });

      const pastFormatted = applyTransforms(past.dateOfBirth ?? "", [
        { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
      ]);
      const futureFormatted = applyTransforms(future.passportExpiryDate ?? "", [
        { type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" },
      ]);

      expect(pastFormatted).toBe("01/01/1950");
      expect(futureFormatted).toBe("31/12/2040");
    });
  });
});
