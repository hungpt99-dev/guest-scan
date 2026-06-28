import { describe, it, expect } from "vitest";
import { validateGuestRow } from "../../../features/excel/excelValidation";
import type { GuestRow } from "@guestfill/shared";

function createGuest(overrides: Partial<GuestRow> = {}): GuestRow {
  return {
    id: "guest-1",
    sessionId: "session-1",
    rowId: "row-1",
    fullName: "John Doe",
    dateOfBirth: "1990-01-01",
    gender: "M",
    documentType: "PASSPORT",
    status: "READY",
    fillStatus: "PENDING",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("excelValidation", () => {
  describe("validateGuestRow", () => {
    it("returns no errors for valid guest", () => {
      const errors = validateGuestRow(createGuest());
      expect(errors).toHaveLength(0);
    });

    it("returns error for empty full name", () => {
      const errors = validateGuestRow(createGuest({ fullName: "" }));
      expect(errors).toContain("Full name is required");
    });

    it("returns error for whitespace-only full name", () => {
      const errors = validateGuestRow(createGuest({ fullName: "   " }));
      expect(errors).toContain("Full name is required");
    });

    it("returns error for UNKNOWN document type", () => {
      const errors = validateGuestRow(createGuest({ documentType: "UNKNOWN" }));
      expect(errors).toContain("Document type must be PASSPORT or ID_CARD");
    });

    it("returns error for empty document type", () => {
      const errors = validateGuestRow(createGuest({ documentType: "" as GuestRow["documentType"] }));
      expect(errors).toContain("Document type must be PASSPORT or ID_CARD");
    });

    it("returns multiple errors", () => {
      const errors = validateGuestRow(createGuest({ fullName: "", documentType: "UNKNOWN" }));
      expect(errors).toHaveLength(2);
    });
  });
});
