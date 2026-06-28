import { describe, it, expect } from "vitest";
import { getFieldValue, getFieldsInOrder, navigateField, navigateGuest } from "../../../features/fill/copyAssistant";
import type { GuestRow } from "@guestfill/shared";

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
});
