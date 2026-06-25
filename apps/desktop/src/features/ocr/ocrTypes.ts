import type { OcrJobStatus, OcrSummary } from "@guestfill/shared";

export type OcrJob = {
  jobId: string;
  status: OcrJobStatus;
  inputFiles: string[];
  outputPath?: string;
  summary?: OcrSummary;
  createdAt: string;
  completedAt?: string;
};

export type OcrRequest = {
  files: string[];
  outputPath: string;
  options?: OcrOptions;
};

export type OcrOptions = {
  language?: string;
  preprocessing?: boolean;
  documentMode?: string;
  maxImageWidth?: number;
  perImageTimeoutSeconds?: number;
  perCandidateTimeoutSeconds?: number;
  enablePassportMrz?: boolean;
  enablePassportVisualOcr?: boolean;
  enableIdCardOcr?: boolean;
  enablePdfInput?: boolean;
  enableDiagnosticsSheet?: boolean;
  deleteTempFiles?: boolean;
  progressPath?: string;
};
