import { describe, it, expect } from "vitest";
import { validateGuestRow } from "../../../features/excel/excelValidation";
import { maskPassportNumber, maskIdNumber, maskFullName, formatDate } from "@guestfill/shared";
import type { GuestRow } from "@guestfill/shared";

describe("Excel Import Integration", () => {
  it("validates guest row after import normalization", () => {
    const guest: GuestRow = {
      id: "g1",
      sessionId: "s1",
      rowId: "r1",
      fullName: "Alice Johnson",
      surname: "Johnson",
      givenName: "Alice",
      passportNumber: "CD789012",
      nationality: "Canada",
      dateOfBirth: "1988-03-22",
      gender: "F",
      passportExpiryDate: "2028-03-22",
      documentType: "PASSPORT",
      status: "READY",
      fillStatus: "PENDING",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    const errors = validateGuestRow(guest);
    expect(errors).toHaveLength(0);
  });

  it("detects invalid rows during import validation", () => {
    const invalidGuest: GuestRow = {
      id: "g2",
      sessionId: "s1",
      rowId: "r2",
      fullName: "",
      documentType: "UNKNOWN",
      status: "MISSING_DATA",
      fillStatus: "PENDING",
      gender: "UNKNOWN",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    const errors = validateGuestRow(invalidGuest);
    expect(errors).toHaveLength(2);
    expect(errors).toContain("Full name is required");
    expect(errors).toContain("Document type must be PASSPORT or ID_CARD");
  });

  it("masks sensitive data in logs after import", () => {
    const guest: GuestRow = {
      id: "g3",
      sessionId: "s1",
      rowId: "r3",
      fullName: "Bob Williams",
      passportNumber: "EF345678",
      idNumber: "987654321",
      documentType: "PASSPORT",
      status: "READY",
      fillStatus: "PENDING",
      gender: "M",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    const maskedPassport = maskPassportNumber(guest.passportNumber!);
    const maskedId = maskIdNumber(guest.idNumber!);
    const maskedName = maskFullName(guest.fullName);

    expect(maskedPassport).toBe("EF34****");
    expect(maskedId).toBe("9876*****");
    expect(maskedName).toBe("Bob W*******");
  });

  it("formats dates consistently across import and display", () => {
    const rawDate = "2025-12-31";

    const displayFormat = formatDate(rawDate, "dd/MM/yyyy");
    expect(displayFormat).toBe("31/12/2025");

    const usFormat = formatDate(rawDate, "MM/dd/yyyy");
    expect(usFormat).toBe("12/31/2025");

    const isoFormat = formatDate(rawDate, "yyyy-MM-dd");
    expect(isoFormat).toBe("2025-12-31");
  });
});
