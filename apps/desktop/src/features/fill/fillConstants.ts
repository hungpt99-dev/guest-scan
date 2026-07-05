import type { FillFieldMeta } from "./fillTypes";

export const GUEST_FIELDS: FillFieldMeta[] = [
  { key: "fullName", label: "Full Name", placeholder: "e.g. Smith John", required: true },
  { key: "firstName", label: "First Name", placeholder: "e.g. John" },
  { key: "lastName", label: "Last Name", placeholder: "e.g. Smith" },
  { key: "dateOfBirth", label: "Date of Birth", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "gender", label: "Gender", placeholder: "M / F / X" },
  { key: "nationality", label: "Nationality", placeholder: "e.g. VNM, GBR" },
  { key: "passportNumber", label: "Passport Number", placeholder: "e.g. AB1234567", required: true },
  { key: "idNumber", label: "ID Number", placeholder: "e.g. ID card number" },
  { key: "documentType", label: "Document Type", placeholder: "PASSPORT / ID_CARD" },
  { key: "issueDate", label: "Issue Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "expiryDate", label: "Expiry Date", placeholder: "YYYY-MM-DD", type: "date" },
  { key: "issuingCountry", label: "Issuing Country", placeholder: "e.g. VNM" },
  { key: "mrzCode", label: "MRZ / Passport Code", placeholder: "Machine-readable zone text" },
  { key: "address", label: "Address", placeholder: "Full address if available" },
];

export const GUEST_FIELD_KEYS: readonly string[] = GUEST_FIELDS.map((f) => f.key);

export const REQUIRED_GUEST_FIELDS: readonly string[] = GUEST_FIELDS.filter((f) => f.required).map((f) => f.key);

export const FIELD_LABEL_MAP: Record<string, string> = Object.fromEntries(GUEST_FIELDS.map((f) => [f.key, f.label]));

export const FILL_FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "passportNumber", label: "Passport Number" },
  { key: "idNumber", label: "ID Number" },
  { key: "nationality", label: "Nationality" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "passportExpiryDate", label: "Passport Expiry Date" },
  { key: "idExpiryDate", label: "ID Expiry Date" },
  { key: "roomNumber", label: "Room Number" },
  { key: "arrivalDate", label: "Arrival Date" },
  { key: "departureDate", label: "Departure Date" },
  { key: "reservationCode", label: "Reservation Code" },
  { key: "note", label: "Note" },
] as const;

export const DEFAULT_FIELD_ORDER = FILL_FIELDS.map((f) => f.key) as readonly string[];

export const FILL_FIELD_LABELS: Record<string, string> = {
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

export const DEFAULT_KEYBOARD_SHORTCUTS = {
  copyCurrentField: "Ctrl+Shift+C",
  nextField: "Ctrl+Shift+N",
  previousField: "Ctrl+Shift+P",
  nextGuest: "Ctrl+Shift+G",
  previousGuest: "Ctrl+Shift+H",
  markFilled: "Ctrl+Shift+F",
  markSkipped: "Ctrl+Shift+S",
  emergencyStop: "Ctrl+Alt+Esc",
} as const;

export const ERROR_CODES = {
  EXCEL_FILE_NOT_FOUND: "EXCEL_FILE_NOT_FOUND",
  EXCEL_FILE_LOCKED: "EXCEL_FILE_LOCKED",
  EXCEL_IMPORT_FAILED: "EXCEL_IMPORT_FAILED",
  GUESTS_SHEET_NOT_FOUND: "GUESTS_SHEET_NOT_FOUND",
  MISSING_REQUIRED_COLUMN: "MISSING_REQUIRED_COLUMN",
  NO_VALID_ROWS: "NO_VALID_ROWS",
  INVALID_DATE_FORMAT: "INVALID_DATE_FORMAT",
  INVALID_GENDER_VALUE: "INVALID_GENDER_VALUE",
  DUPLICATE_DOCUMENT_NUMBER: "DUPLICATE_DOCUMENT_NUMBER",
  CLIPBOARD_COPY_FAILED: "CLIPBOARD_COPY_FAILED",
  TARGET_SYSTEM_NOT_SELECTED: "TARGET_SYSTEM_NOT_SELECTED",
  TARGET_PAGE_MISMATCH: "TARGET_PAGE_MISMATCH",
  TARGET_WINDOW_MISMATCH: "TARGET_WINDOW_MISMATCH",
  TARGET_FIELD_NOT_FOUND: "TARGET_FIELD_NOT_FOUND",
  TARGET_FIELD_DISABLED: "TARGET_FIELD_DISABLED",
  REQUIRED_VALUE_MISSING: "REQUIRED_VALUE_MISSING",
  AUTO_SAVE_NOT_CONFIGURED: "AUTO_SAVE_NOT_CONFIGURED",
  AUTO_SAVE_SAFETY_CHECK_FAILED: "AUTO_SAVE_SAFETY_CHECK_FAILED",
  AUTO_SAVE_FAILED: "AUTO_SAVE_FAILED",
  FILL_STATUS_SAVE_FAILED: "FILL_STATUS_SAVE_FAILED",
  FILL_LOG_EXPORT_FAILED: "FILL_LOG_EXPORT_FAILED",
  FILL_STOPPED_BY_USER: "FILL_STOPPED_BY_USER",
  LOW_CONFIDENCE_WARNING: "LOW_CONFIDENCE_WARNING",
  FIELD_FORMAT_INVALID: "FIELD_FORMAT_INVALID",
  FIELD_ACCURACY_FAILED: "FIELD_ACCURACY_FAILED",
  CONFIDENCE_CHECK_FAILED: "CONFIDENCE_CHECK_FAILED",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
