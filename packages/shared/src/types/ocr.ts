import type { AppError } from "./error";
import type { ConfidenceLevel, DocumentType, Gender } from "./guest";

/** Existing: job-level status (for batch OCR processing) */
export type OcrJobStatus = "IDLE" | "PROCESSING" | "COMPLETED" | "FAILED";

/** Existing: summary of a batch OCR job */
export type OcrSummary = {
  totalFiles: number;
  totalDocuments: number;
  ready: number;
  needReview: number;
  failed: number;
  averageConfidence: number;
};

/** Existing: result of a batch OCR job */
export type OcrJobResult = {
  jobId: string;
  status: "COMPLETED" | "FAILED";
  outputPath?: string;
  summary: OcrSummary;
  errors: AppError[];
};

/* ───── Feature: OCR provider types ───── */

export type OcrProviderType = "LOCAL" | "AZURE";

/* ───── Feature: per-field extraction data ───── */

export type ExtractedField = {
  value: string;
  confidence: number;
  source?: "mrz" | "visual_ocr" | "azure_document_intelligence";
};

export type ExtractedFields = {
  fullName?: ExtractedField;
  firstName?: ExtractedField;
  lastName?: ExtractedField;
  dateOfBirth?: ExtractedField;
  gender?: ExtractedField;
  nationality?: ExtractedField;
  passportNumber?: ExtractedField;
  idNumber?: ExtractedField;
  documentType?: ExtractedField;
  issueDate?: ExtractedField;
  expiryDate?: ExtractedField;
  issuingCountry?: ExtractedField;
  mrzCode?: ExtractedField;
  address?: ExtractedField;
};

/* ───── Feature: OCR result ───── */

export type OcrProcessingStatus = "IDLE" | "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type OcrWarningCode =
  | "IMAGE_BLURRY"
  | "IMAGE_GLARE"
  | "LOW_RESOLUTION"
  | "DOCUMENT_NOT_FULLY_VISIBLE"
  | "MRZ_NOT_FOUND"
  | "MRZ_CUT_OFF"
  | "MRZ_REPAIRED"
  | "MRZ_CHECK_DIGIT_FAILED"
  | "DOCUMENT_EXPIRED"
  | "DOCUMENT_EXPIRING_SOON"
  | "DOCUMENT_TYPE_UNSUPPORTED"
  | "LOW_CONFIDENCE_FIELD"
  | "MISSING_REQUIRED_FIELD"
  | "FIELD_CONFLICT"
  | "HUMAN_REVIEW_REQUIRED";

export type OcrResult = {
  fields: ExtractedFields;
  rawText?: string;
  overallConfidence: number;
  overallConfidenceLevel: ConfidenceLevel;
  provider: OcrProviderType;
  warnings: OcrWarningCode[];
  detectedDocumentType?: DocumentType;
  detectedGender?: Gender;
  isExpired?: boolean;
  processingTimeMs?: number;
};

/* ───── Feature: provider interface contract ───── */

export interface OcrProvider {
  readonly name: string;
  readonly type: OcrProviderType;

  processImage(imagePath: string, signal?: AbortSignal): Promise<OcrResult>;

  cancel?(): void;

  isAvailable(): boolean;
}

export type OcrProcessingOptions = {
  provider: OcrProviderType;
  imagePath: string;
  onStatusChange?: (status: OcrProcessingStatus) => void;
  signal?: AbortSignal;
};
