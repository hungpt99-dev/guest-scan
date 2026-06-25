import type { GuestRow } from "@guestfill/shared";

export function validateGuestRow(row: GuestRow): string[] {
  const errors: string[] = [];

  if (!row.fullName.trim()) {
    errors.push("Full name is required");
  }

  if (!row.documentType || row.documentType === "UNKNOWN") {
    errors.push("Document type must be PASSPORT or ID_CARD");
  }

  return errors;
}
