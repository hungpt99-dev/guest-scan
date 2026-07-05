import { invokeIpc } from "../infra/ipc";
import { logger } from "../lib/logger";
import { ok, err } from "../lib/result";
import { OCR_TIMEOUT_MS } from "../config/constants";
import type { ApiError, ApiErrorCode, ApiResult } from "./types";

export type ApiClientConfig = {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
};

const DEFAULT_CONFIG: ApiClientConfig = {
  timeoutMs: OCR_TIMEOUT_MS,
  retryCount: 2,
  retryDelayMs: 500,
};

export interface ApiClient {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<ApiResult<T>>;
}

class DefaultApiClient implements ApiClient {
  constructor(private readonly config: ApiClientConfig = DEFAULT_CONFIG) {}

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<ApiResult<T>> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      if (attempt > 0) {
        logger.debug(`ApiClient: retrying command "${command}" (attempt ${attempt})`);
        await this.delay(this.config.retryDelayMs * attempt);
      }

      try {
        const result = await this.invokeWithTimeout<T>(command, args);
        return ok(result);
      } catch (error) {
        lastError = error;
        const apiError = this.normalizeError(error);

        if (apiError.code === "RATE_LIMITED" || apiError.code === "TIMEOUT") {
          continue;
        }

        return err(apiError);
      }
    }

    return err(this.normalizeError(lastError));
  }

  private async invokeWithTimeout<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const result = await invokeIpc<T>(command, args);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeError(error: unknown): ApiError {
    if (error && typeof error === "object") {
      const errObj = error as Record<string, unknown>;

      if (errObj.code === "IPC_UNAVAILABLE") {
        return { code: "IPC_UNAVAILABLE", message: String(errObj.message ?? "IPC unavailable"), details: error };
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return { code: "TIMEOUT", message: "Request timed out", details: error };
        }
        const errType = (error as { type?: string }).type;
        if (errType) {
          return { code: errType as ApiErrorCode, message: error.message, details: error };
        }
        return { code: "PIPELINE_FAILED", message: error.message, details: error };
      }

      if (errObj.code && errObj.message) {
        return { code: errObj.code as ApiErrorCode, message: String(errObj.message), details: error };
      }
    }

    return { code: "PIPELINE_FAILED", message: "Unknown API error", details: error };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let instance: ApiClient | null = null;

export function createApiClient(config?: Partial<ApiClientConfig>): ApiClient {
  return new DefaultApiClient({ ...DEFAULT_CONFIG, ...config });
}

export function getApiClient(): ApiClient {
  if (!instance) {
    instance = createApiClient();
  }
  return instance;
}

export type { ApiErrorCode } from "./types";
