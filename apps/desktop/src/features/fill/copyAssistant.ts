import type { GuestRow, FillEvent } from "@guestfill/shared";
import { DEFAULT_FIELD_ORDER } from "./fillConstants";
import { saveFillEvent } from "./fillStore";

export async function copyField(guest: GuestRow, fieldName: string): Promise<boolean> {
  const value = (guest as Record<string, unknown>)[fieldName];
  if (value === undefined || value === null || value === "") {
    return false;
  }
  try {
    const { writeText } = await import("@tauri-apps/api/clipboard");
    await writeText(String(value));
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FIELD_COPIED",
      fieldName,
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return true;
  } catch {
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FILL_FAILED",
      fieldName,
      status: "FAILURE",
      message: "CLIPBOARD_COPY_FAILED",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return false;
  }
}

export function getFieldValue(guest: GuestRow, fieldName: string): string {
  const value = (guest as Record<string, unknown>)[fieldName];
  if (value === undefined || value === null) return "";
  return String(value);
}

export function getFieldsInOrder(
  guest: GuestRow,
  fieldOrder?: string[],
): Array<{ key: string; label: string; value: string }> {
  const order = fieldOrder ?? DEFAULT_FIELD_ORDER;
  const labelMap: Record<string, string> = {
    fullName: "Full Name",
    surname: "Surname",
    givenName: "Given Name",
    passportNumber: "Passport Number",
    idNumber: "ID Number",
    nationality: "Nationality",
    dateOfBirth: "Date of Birth",
    gender: "Gender",
    passportExpiryDate: "Passport Expiry Date",
    idExpiryDate: "ID Expiry Date",
    issuingCountry: "Issuing Country",
    issuingAuthority: "Issuing Authority",
    documentType: "Document Type",
    roomNumber: "Room Number",
    arrivalDate: "Arrival Date",
    departureDate: "Departure Date",
    reservationCode: "Reservation Code",
    note: "Note",
  };
  return order
    .filter((key) => key in guest)
    .map((key) => ({
      key,
      label: labelMap[key] ?? key,
      value: getFieldValue(guest, key),
    }));
}

export function navigateField(currentIndex: number, totalFields: number, direction: "next" | "prev"): number {
  if (direction === "next") {
    return Math.min(currentIndex + 1, totalFields - 1);
  }
  return Math.max(currentIndex - 1, 0);
}

export function navigateGuest(currentIndex: number, totalGuests: number, direction: "next" | "prev"): number {
  if (direction === "next") {
    return Math.min(currentIndex + 1, totalGuests - 1);
  }
  return Math.max(currentIndex - 1, 0);
}
