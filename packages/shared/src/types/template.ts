export type TargetSystemType = "copy_assistant" | "web" | "desktop";

export type SaveMode = "manual" | "auto";

export type FieldMapping = {
  id: string;
  excelColumn: string;
  targetFieldName: string;
  targetType: "copy" | "web" | "desktop";
  webSelector?: string;
  desktopAutomationId?: string;
  desktopFieldLabel?: string;
  tabOrderIndex?: number;
  transform?: import("./transform").TransformRule[];
  required: boolean;
  enabled: boolean;
};

export type TargetSystemTemplate = {
  id: string;
  name: string;
  type: TargetSystemType;
  saveMode: SaveMode;
  urlPattern?: string;
  windowTitlePattern?: string;
  processName?: string;
  mappings: FieldMapping[];
  safetyRules: SafetyRule[];
  autoSaveSelector?: string;
  autoSaveControlId?: string;
  submitWaitMs?: number;
  version: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
};

export type SafetyRule = {
  id: string;
  type: "field_exists" | "page_url_matches" | "window_title_matches" | "no_popup";
  config?: Record<string, string>;
};
