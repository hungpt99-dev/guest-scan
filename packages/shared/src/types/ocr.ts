import type { AppError } from "./error";

export type OcrJobStatus = "IDLE" | "PROCESSING" | "COMPLETED" | "FAILED";

export type OcrSummary = {
  totalFiles: number;
  totalDocuments: number;
  ready: number;
  needReview: number;
  failed: number;
  averageConfidence: number;
};

export type OcrJobResult = {
  jobId: string;
  status: "COMPLETED" | "FAILED";
  outputPath?: string;
  summary: OcrSummary;
  errors: AppError[];
};
