export type FillEventType =
  | "EXCEL_IMPORTED"
  | "GUEST_OPENED"
  | "FIELD_COPIED"
  | "WEB_FILL_STARTED"
  | "WEB_FIELD_FILLED"
  | "WEB_FILL_COMPLETED"
  | "DESKTOP_FILL_STARTED"
  | "DESKTOP_FIELD_FILLED"
  | "DESKTOP_FILL_COMPLETED"
  | "AUTO_SAVE_STARTED"
  | "AUTO_SAVE_COMPLETED"
  | "AUTO_SAVE_SKIPPED"
  | "GUEST_MARKED_FILLED"
  | "GUEST_MARKED_SKIPPED"
  | "TEMPLATE_CREATED"
  | "TEMPLATE_UPDATED"
  | "FILL_FAILED";

export type FillEvent = {
  id: string;
  sessionId: string;
  guestRowId: string;
  targetSystemId?: string;
  eventType: FillEventType;
  fieldName?: string;
  status: "SUCCESS" | "FAILURE" | "SKIPPED";
  message?: string;
  createdAt: string;
};
