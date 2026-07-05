import { logger } from "../lib/logger";

export type AppErrorCode =
  | "CAPTURE_FAILED"
  | "NO_IMAGE"
  | "PIPELINE_FAILED"
  | "IPC_UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export type AppErrorSeverity = "critical" | "error" | "warning" | "info";

export type AppErrorDetails = {
  code: AppErrorCode;
  message: string;
  severity?: AppErrorSeverity;
  statusCode?: number;
  retryable?: boolean;
  details?: unknown;
  source?: string;
};

const SENSITIVE_ERROR_KEYS = [
  /passport/i,
  /id.?number/i,
  /ssn/i,
  /full.?name/i,
  /surname/i,
  /given.?name/i,
  /date.?of.?birth/i,
  /dob/i,
  /birth.?date/i,
  /expiry/i,
  /image.?path/i,
  /base64/i,
  /token/i,
  /secret/i,
  /api.?key/i,
  /authorization/i,
  /password/i,
];

function maskSensitiveValue(key: string, value: string): string {
  for (const pattern of SENSITIVE_ERROR_KEYS) {
    if (pattern.test(key)) {
      if (value.length <= 4) return "****";
      return value.slice(0, 2) + "****" + value.slice(-2);
    }
  }
  return value;
}

export function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      masked[key] = maskSensitiveValue(key, value);
    } else if (value && typeof value === "object") {
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly severity: AppErrorSeverity;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;
  public readonly source?: string;

  constructor(details: AppErrorDetails) {
    super(details.message);
    this.name = "AppError";
    this.code = details.code;
    this.severity = details.severity ?? determineSeverity(details.code);
    this.statusCode = details.statusCode;
    this.retryable = details.retryable ?? determineRetryable(details.code);
    this.details = details.details;
    this.source = details.source;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      statusCode: this.statusCode,
      retryable: this.retryable,
      source: this.source,
    };
  }
}

function determineSeverity(code: AppErrorCode): AppErrorSeverity {
  switch (code) {
    case "IPC_UNAVAILABLE":
      return "critical";
    case "NETWORK_ERROR":
    case "TIMEOUT":
      return "error";
    case "VALIDATION_ERROR":
      return "warning";
    default:
      return "error";
  }
}

function determineRetryable(code: AppErrorCode): boolean {
  switch (code) {
    case "TIMEOUT":
    case "RATE_LIMITED":
    case "NETWORK_ERROR":
      return true;
    default:
      return false;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown, fallbackMessage?: string): AppError {
  if (isAppError(error)) return error;

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new AppError({ code: "TIMEOUT", message: error.message || "Request timed out", details: error });
    }
    const code = extractErrorCode(error) ?? "UNKNOWN_ERROR";
    return new AppError({ code, message: error.message || fallbackMessage || "An error occurred", details: error });
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const code = (typeof obj.code === "string" ? obj.code : "UNKNOWN_ERROR") as AppErrorCode;
    const message = typeof obj.message === "string" ? obj.message : fallbackMessage || "An error occurred";
    return new AppError({ code, message, details: error });
  }

  return new AppError({
    code: "UNKNOWN_ERROR",
    message: fallbackMessage || "An unknown error occurred",
    details: error,
  });
}

function extractErrorCode(error: Error): AppErrorCode | null {
  const err = error as { code?: string; type?: string };
  if (err.code && isAppErrorCode(err.code)) return err.code as AppErrorCode;
  if (err.type && isAppErrorCode(err.type)) return err.type as AppErrorCode;
  return null;
}

function isAppErrorCode(value: string): value is AppErrorCode {
  const codes: AppErrorCode[] = [
    "CAPTURE_FAILED",
    "NO_IMAGE",
    "PIPELINE_FAILED",
    "IPC_UNAVAILABLE",
    "TIMEOUT",
    "RATE_LIMITED",
    "VALIDATION_ERROR",
    "NETWORK_ERROR",
    "UNKNOWN_ERROR",
  ];
  return codes.includes(value as AppErrorCode);
}

export function formatErrorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

export function getErrorCode(error: unknown): AppErrorCode {
  if (isAppError(error)) return error.code;
  if (error instanceof Error) {
    return extractErrorCode(error) ?? "UNKNOWN_ERROR";
  }
  return "UNKNOWN_ERROR";
}

export function isRetryableError(error: unknown): boolean {
  if (isAppError(error)) return error.retryable;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
  }
  return false;
}

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  onRetry: (_attempt: number, _error: unknown) => {},
};

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * exponential * 0.1;
  return Math.min(exponential + jitter, maxDelayMs);
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const appError = toAppError(error);
      if (!appError.retryable) throw appError;
      if (attempt < config.maxRetries) {
        const backoffMs = calculateBackoff(attempt, config.baseDelayMs, config.maxDelayMs);
        config.onRetry(attempt, error);
        logger.debug(`Retry attempt ${attempt}/${config.maxRetries - 1} after ${backoffMs}ms`, {
          errorCode: appError.code,
        });
        await delay(backoffMs);
      }
    }
  }

  throw toAppError(lastError, `Operation failed after ${config.maxRetries} retries`);
}

export type TimeoutOptions = {
  timeoutMs: number;
  timeoutMessage?: string;
};

export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, options: TimeoutOptions): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError({
        code: "TIMEOUT",
        message: options.timeoutMessage ?? `Operation timed out after ${options.timeoutMs}ms`,
        retryable: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function categorizeError(error: unknown): {
  category: "network" | "validation" | "timeout" | "unknown";
  userMessage: string;
  retryable: boolean;
} {
  const appError = toAppError(error);

  switch (appError.code) {
    case "NETWORK_ERROR":
      return {
        category: "network",
        userMessage: "Network connection failed. Please check your connection.",
        retryable: true,
      };
    case "TIMEOUT":
      return { category: "timeout", userMessage: "The operation timed out. Please try again.", retryable: true };
    case "RATE_LIMITED":
      return { category: "network", userMessage: "Too many requests. Please wait and try again.", retryable: true };
    case "VALIDATION_ERROR":
      return { category: "validation", userMessage: appError.message, retryable: false };
    case "IPC_UNAVAILABLE":
      return {
        category: "network",
        userMessage: "Application connection unavailable. Please restart.",
        retryable: false,
      };
    default:
      return { category: "unknown", userMessage: "An unexpected error occurred. Please try again.", retryable: false };
  }
}

export function safeLogError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const appError = toAppError(error);
  const safeContext: Record<string, unknown> = {
    errorCode: appError.code,
    errorSeverity: appError.severity,
    ...(context ? maskSensitiveData(context) : {}),
  };
  if (appError.source) {
    safeContext.source = appError.source;
  }
  logger.error(message, safeContext);
}

export function safeLogWarn(message: string, error?: unknown, context?: Record<string, unknown>): void {
  const safeContext = context ? maskSensitiveData(context) : undefined;
  if (error) {
    const appError = toAppError(error);
    logger.warn(message, {
      errorCode: appError.code,
      ...safeContext,
    });
  } else {
    logger.warn(message, safeContext);
  }
}
