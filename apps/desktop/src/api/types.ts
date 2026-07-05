import type { Result } from "../lib/result";

export type ApiErrorCode =
  | "CAPTURE_FAILED"
  | "NO_IMAGE"
  | "BLURRY_IMAGE"
  | "GLARE_REFLECTION"
  | "DOCUMENT_NOT_DETECTED"
  | "MRZ_NOT_FOUND"
  | "OCR_CONFIDENCE_TOO_LOW"
  | "INVALID_MRZ_CHECKSUM"
  | "EXPIRED_DOCUMENT"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "PADDLE_OCR_UNAVAILABLE"
  | "TESSERACT_FALLBACK_UNAVAILABLE"
  | "STAFF_CANCELLED_REVIEW"
  | "PIPELINE_FAILED"
  | "IPC_UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

export type ApiResult<T> = Result<T, ApiError>;
