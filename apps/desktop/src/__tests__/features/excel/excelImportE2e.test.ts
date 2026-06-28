import { describe, it, expect } from "vitest";
import { validateGuestRow } from "../../../features/excel/excelValidation";
import { maskPassportNumber, maskIdNumber, maskFullName, formatDate } from "@guestfill/shared";
import type { GuestRow } from "@guestfill/shared";

describe("Excel Import E2E: validation and data integrity", () => {
  describe("validation edge cases", () => {
    it("rejects row with empty full name", () => {
      const guest: GuestRow = {
        id: "g1",
        sessionId: "s1",
        rowId: "r1",
        fullName: "",
        gender: "M",
        documentType: "PASSPORT",
        status: "MISSING_DATA",
        fillStatus: "PENDING",
        createdAt: "",
        updatedAt: "",
      };
      const errors = validateGuestRow(guest);
      expect(errors).toContain("Full name is required");
    });

    it("rejects row with whitespace-only full name", () => {
      const guest: GuestRow = {
        id: "g2",
        sessionId: "s1",
        rowId: "r2",
        fullName: "   ",
        gender: "M",
        documentType: "PASSPORT",
        status: "MISSING_DATA",
        fillStatus: "PENDING",
        createdAt: "",
        updatedAt: "",
      };
      const errors = validateGuestRow(guest);
      expect(errors).toContain("Full name is required");
    });

    it("rejects row with unknown document type", () => {
      const guest: GuestRow = {
        id: "g3",
        sessionId: "s1",
        rowId: "r3",
        fullName: "Alice",
        gender: "M",
        documentType: "UNKNOWN",
        status: "NEED_REVIEW",
        fillStatus: "PENDING",
        createdAt: "",
        updatedAt: "",
      };
      const errors = validateGuestRow(guest);
      expect(errors).toContain("Document type must be PASSPORT or ID_CARD");
    });

    it("passes valid passport guest row", () => {
      const guest: GuestRow = {
        id: "g4",
        sessionId: "s1",
        rowId: "r4",
        fullName: "Alice Johnson",
        passportNumber: "AB123456",
        nationality: "USA",
        dateOfBirth: "1988-03-22",
        gender: "F",
        passportExpiryDate: "2028-03-22",
        documentType: "PASSPORT",
        status: "READY",
        fillStatus: "PENDING",
        createdAt: "",
        updatedAt: "",
      };
      expect(validateGuestRow(guest)).toHaveLength(0);
    });

    it("passes valid ID card guest row", () => {
      const guest: GuestRow = {
        id: "g5",
        sessionId: "s1",
        rowId: "r5",
        fullName: "Bob Williams",
        idNumber: "987654321",
        documentType: "ID_CARD",
        gender: "M",
        status: "READY",
        fillStatus: "PENDING",
        createdAt: "",
        updatedAt: "",
      };
      expect(validateGuestRow(guest)).toHaveLength(0);
    });

    it("collects multiple errors at once", () => {
      const guest: GuestRow = {
        id: "g6",
        sessionId: "s1",
        rowId: "r6",
        fullName: "",
        gender: "UNKNOWN",
        documentType: "UNKNOWN",
        status: "FAILED",
        fillStatus: "FAILED",
        createdAt: "",
        updatedAt: "",
      };
      const errors = validateGuestRow(guest);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("data masking E2E", () => {
    it("masks passport numbers consistently", () => {
      expect(maskPassportNumber("AB123456")).toBe("AB12****");
      expect(maskPassportNumber("CD789012")).toBe("CD78****");
      expect(maskPassportNumber("AB")).toBe("AB");
    });

    it("masks ID numbers with correct pattern", () => {
      expect(maskIdNumber("123456789")).toBe("1234*****");
      expect(maskIdNumber("98765")).toBe("9876*");
      expect(maskIdNumber("12")).toBe("12");
    });

    it("masks full names correctly for various formats", () => {
      expect(maskFullName("John Doe")).toBe("John D**");
      expect(maskFullName("Jane Marie Smith")).toBe("Jane Marie S****");
      expect(maskFullName("A")).toBe("A");
      expect(maskFullName("Nguyen Van An")).toBe("Nguyen Van A*");
    });

    it("masks sensitive data in logs consistently", () => {
      const passport = "P12345678";
      const idNumber = "ID9876543";
      expect(maskPassportNumber(passport)).toBe("P123*****");
      expect(maskIdNumber(idNumber)).toBe("ID98*****");
    });
  });

  describe("date formatting E2E", () => {
    it("formats dates in various display formats", () => {
      const raw = "2025-12-31";
      expect(formatDate(raw, "dd/MM/yyyy")).toBe("31/12/2025");
      expect(formatDate(raw, "MM/dd/yyyy")).toBe("12/31/2025");
      expect(formatDate(raw, "yyyy-MM-dd")).toBe("2025-12-31");
    });

    it("handles empty date gracefully", () => {
      expect(formatDate("", "dd/MM/yyyy")).toBe("");
    });

    it("handles invalid date gracefully", () => {
      expect(formatDate("not-a-date", "dd/MM/yyyy")).toBe("not-a-date");
    });
  });
});
