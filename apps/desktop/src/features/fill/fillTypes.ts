export type FillSession = {
  id: string;
  excelPath: string;
  excelFileHash: string;
  createdAt: string;
  updatedAt: string;
  totalRows: number;
  readyCount: number;
  needReviewCount: number;
  missingDataCount: number;
  failedCount: number;
};

export type ImportSummary = {
  totalRows: number;
  imported: number;
  ready: number;
  needReview: number;
  missingData: number;
  failed: number;
  duplicateDocuments: number;
  skippedEmpty: number;
};

export type FillActionRequest = {
  guestRowId: string;
  field: string;
  value: string;
};

export type FieldNavigationState = {
  currentFieldIndex: number;
  currentGuestIndex: number;
  fieldOrder: string[];
  guestIds: string[];
};

export type FieldInputType = "text" | "date" | "select" | "tel" | "email";

export type FillFieldMeta = {
  key: string;
  label: string;
  placeholder: string;
  type?: FieldInputType;
  required?: boolean;
  group?: string;
};
