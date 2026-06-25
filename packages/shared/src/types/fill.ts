export type FillStatus = "PENDING" | "IN_PROGRESS" | "FILLED" | "SKIPPED" | "FAILED";

export type FillState = {
  fillStatus: FillStatus;
  copiedFields: Record<string, boolean>;
  filledFields: Record<string, boolean>;
  failedFields: Record<string, string>;
  targetSystemId?: string;
  targetSystemName?: string;
  startedAt?: string;
  filledAt?: string;
  skippedAt?: string;
  updatedAt: string;
};

export type FillAction =
  | "COPY_NAME"
  | "COPY_PASSPORT"
  | "COPY_ID_NUMBER"
  | "COPY_NATIONALITY"
  | "COPY_DATE_OF_BIRTH"
  | "COPY_ROOM_NUMBER"
  | "COPY_ARRIVAL_DATE"
  | "COPY_DEPARTURE_DATE"
  | "COPY_RESERVATION_CODE"
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

export type FillTarget = {
  guestRow: import("./guest").GuestRow;
  action: FillAction;
  value: string;
};

export type FillHistoryEntry = {
  guestRowId: string;
  action: FillAction;
  timestamp: string;
  success: boolean;
};
