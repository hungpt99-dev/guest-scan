export type GuestStatus = "READY" | "NEED_REVIEW" | "FAILED" | "MISSING_DATA" | "FILLED" | "SKIPPED";

export type DocumentType = "PASSPORT" | "ID_CARD" | "UNKNOWN";

export type Gender = "M" | "F" | "X" | "UNKNOWN";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type GuestRow = {
  id: string;
  sessionId: string;
  rowId: string;
  fullName: string;
  surname?: string;
  givenName?: string;
  passportNumber?: string;
  idNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender: Gender;
  passportExpiryDate?: string;
  idExpiryDate?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  documentType: DocumentType;
  roomNumber?: string;
  arrivalDate?: string;
  departureDate?: string;
  reservationCode?: string;
  status: GuestStatus;
  confidenceScore?: number;
  confidenceLevel?: ConfidenceLevel;
  fieldConfidence?: Record<string, number>;
  fillStatus: import("./fill").FillStatus;
  note?: string;
  ocrWarning?: string;
  sourceFile?: string;
  imagePath?: string;
  createdAt: string;
  updatedAt: string;
};
