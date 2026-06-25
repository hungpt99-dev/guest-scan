export type ExtensionMessage =
  | { type: "CHECK_CONNECTION" }
  | { type: "FETCH_GUESTS" }
  | { type: "GET_FIELD_CANDIDATES" }
  | { type: "DETECT_FIELDS" }
  | { type: "FILL_FIELD"; selector: string; value: string }
  | { type: "FILL_RESULT"; success: boolean; error?: string }
  | { type: "CONNECTION_STATUS"; connected: boolean };

export type BridgeRequest = {
  token?: string;
  sessionId?: string;
  guestId?: string;
  fieldName?: string;
  value?: string;
};
