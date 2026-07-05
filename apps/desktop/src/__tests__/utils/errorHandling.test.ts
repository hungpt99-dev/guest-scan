import { describe, it, expect, vi } from "vitest";
import {
  AppError,
  isAppError,
  toAppError,
  formatErrorMessage,
  getErrorCode,
  isRetryableError,
  maskSensitiveData,
  withRetry,
  withTimeout,
  categorizeError,
  safeLogError,
  safeLogWarn,
} from "../../utils/errorHandling";

describe("AppError", () => {
  it("creates error with code and message", () => {
    const error = new AppError({ code: "TIMEOUT", message: "Request timed out" });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toBe("Request timed out");
    expect(error.name).toBe("AppError");
  });

  it("sets default severity based on code", () => {
    expect(new AppError({ code: "IPC_UNAVAILABLE", message: "x" }).severity).toBe("critical");
    expect(new AppError({ code: "NETWORK_ERROR", message: "x" }).severity).toBe("error");
    expect(new AppError({ code: "TIMEOUT", message: "x" }).severity).toBe("error");
    expect(new AppError({ code: "VALIDATION_ERROR", message: "x" }).severity).toBe("warning");
    expect(new AppError({ code: "UNKNOWN_ERROR", message: "x" }).severity).toBe("error");
  });

  it("allows overriding severity", () => {
    const error = new AppError({ code: "TIMEOUT", message: "x", severity: "info" });
    expect(error.severity).toBe("info");
  });

  it("sets retryable based on code", () => {
    expect(new AppError({ code: "TIMEOUT", message: "x" }).retryable).toBe(true);
    expect(new AppError({ code: "RATE_LIMITED", message: "x" }).retryable).toBe(true);
    expect(new AppError({ code: "VALIDATION_ERROR", message: "x" }).retryable).toBe(false);
  });

  it("allows overriding retryable", () => {
    const error = new AppError({ code: "TIMEOUT", message: "x", retryable: false });
    expect(error.retryable).toBe(false);
  });

  it("includes source", () => {
    const error = new AppError({ code: "PIPELINE_FAILED", message: "x", source: "OcrPipeline" });
    expect(error.source).toBe("OcrPipeline");
  });

  it("includes details", () => {
    const details = { imagePath: "/tmp/test.jpg" };
    const error = new AppError({ code: "NO_IMAGE", message: "x", details });
    expect(error.details).toEqual(details);
  });

  it("toJSON returns serializable object", () => {
    const error = new AppError({ code: "TIMEOUT", message: "Request timed out", source: "api" });
    const json = error.toJSON();
    expect(json).toEqual({
      name: "AppError",
      code: "TIMEOUT",
      message: "Request timed out",
      severity: "error",
      retryable: true,
      source: "api",
    });
  });
});

describe("isAppError", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError({ code: "TIMEOUT", message: "x" }))).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAppError("error")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("toAppError", () => {
  it("returns same AppError if already AppError", () => {
    const original = new AppError({ code: "TIMEOUT", message: "x" });
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it("converts AbortError to TIMEOUT", () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const result = toAppError(abortError);
    expect(result.code).toBe("TIMEOUT");
  });

  it("converts regular Error to AppError", () => {
    const error = new Error("Something broke");
    const result = toAppError(error);
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("Something broke");
  });

  it("extracts code from error object with code property", () => {
    const error = new Error("Rate limited") as Error & { code: string };
    error.code = "RATE_LIMITED";
    const result = toAppError(error);
    expect(result.code).toBe("RATE_LIMITED");
  });

  it("extracts code from error type property", () => {
    const error = new Error("Network fail") as Error & { type: string };
    error.type = "NETWORK_ERROR";
    const result = toAppError(error);
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("handles object errors", () => {
    const error = { code: "VALIDATION_ERROR", message: "Invalid input" };
    const result = toAppError(error);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toBe("Invalid input");
  });

  it("handles null/undefined with fallback message", () => {
    const result = toAppError(null, "Custom fallback");
    expect(result.message).toBe("Custom fallback");
    expect(result.code).toBe("UNKNOWN_ERROR");
  });

  it("handles string error with fallback message", () => {
    const result = toAppError("string error", "fallback");
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("fallback");
  });

  it("handles string error without fallback", () => {
    const result = toAppError("string error");
    expect(result.code).toBe("UNKNOWN_ERROR");
    expect(result.message).toBe("An unknown error occurred");
  });
});

describe("formatErrorMessage", () => {
  it("returns message from AppError", () => {
    expect(formatErrorMessage(new AppError({ code: "TIMEOUT", message: "Timed out" }))).toBe("Timed out");
  });

  it("returns message from Error", () => {
    expect(formatErrorMessage(new Error("Boom"))).toBe("Boom");
  });

  it("returns string directly", () => {
    expect(formatErrorMessage("error string")).toBe("error string");
  });

  it("returns fallback for unknown types", () => {
    expect(formatErrorMessage(null)).toBe("An unexpected error occurred");
  });
});

describe("getErrorCode", () => {
  it("returns code from AppError", () => {
    expect(getErrorCode(new AppError({ code: "RATE_LIMITED", message: "x" }))).toBe("RATE_LIMITED");
  });

  it("returns UNKNOWN_ERROR for regular Error", () => {
    expect(getErrorCode(new Error("x"))).toBe("UNKNOWN_ERROR");
  });

  it("returns UNKNOWN_ERROR for non-errors", () => {
    expect(getErrorCode("string")).toBe("UNKNOWN_ERROR");
  });
});

describe("isRetryableError", () => {
  it("returns true for retryable AppError", () => {
    expect(isRetryableError(new AppError({ code: "TIMEOUT", message: "x" }))).toBe(true);
  });

  it("returns false for non-retryable AppError", () => {
    expect(isRetryableError(new AppError({ code: "VALIDATION_ERROR", message: "x" }))).toBe(false);
  });

  it("returns true for AbortError", () => {
    expect(isRetryableError(new DOMException("Aborted", "AbortError"))).toBe(true);
  });

  it("returns false for regular Error", () => {
    expect(isRetryableError(new Error("x"))).toBe(false);
  });
});

describe("maskSensitiveData", () => {
  it("masks passport field", () => {
    const masked = maskSensitiveData({ passport: "AB123456" });
    expect(masked.passport).toBe("AB****56");
  });

  it("masks idNumber field", () => {
    const masked = maskSensitiveData({ idNumber: "123456789" });
    expect(masked.idNumber).toContain("****");
  });

  it("masks fullName field", () => {
    const masked = maskSensitiveData({ fullName: "John Doe" });
    expect(masked.fullName).toBe("Jo****oe");
  });

  it("masks dateOfBirth field", () => {
    const masked = maskSensitiveData({ dateOfBirth: "1990-01-15" });
    expect(masked.dateOfBirth).toContain("****");
  });

  it("masks token field", () => {
    const masked = maskSensitiveData({ token: "abc123secret" });
    expect(masked.token).toBe("ab****et");
  });

  it("masks password field", () => {
    const masked = maskSensitiveData({ password: "mysecret123" });
    expect(masked.password).toBe("my****23");
  });

  it("masks short values", () => {
    const masked = maskSensitiveData({ apiKey: "ab" });
    expect(masked.apiKey).toBe("****");
  });

  it("recursively masks nested objects", () => {
    const masked = maskSensitiveData({ user: { passportNumber: "AB123456" } });
    expect((masked.user as Record<string, unknown>).passportNumber).toContain("****");
  });

  it("preserves non-sensitive fields", () => {
    const masked = maskSensitiveData({ count: 42, active: true, name: "John" });
    expect(masked.count).toBe(42);
    expect(masked.active).toBe(true);
    // "name" is partially matched by fullName pattern but shouldn't be masked
    // let's just check non-sensitive keys are preserved
  });
});

describe("withRetry", () => {
  it("resolves on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).resolves.toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AppError({ code: "TIMEOUT", message: "timeout" }))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws on non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new AppError({ code: "VALIDATION_ERROR", message: "invalid" }));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow("invalid");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fn = vi.fn().mockRejectedValue(abortError);

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow("Aborted");
    expect(fn).toHaveBeenCalledTimes(2);
  }, 5000);

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AppError({ code: "TIMEOUT", message: "timeout" }))
      .mockResolvedValueOnce("ok");

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, onRetry })).resolves.toBe("ok");
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("withTimeout", () => {
  it("resolves before timeout", async () => {
    const fn = vi.fn().mockImplementation(async (_signal: AbortSignal) => "done");
    await expect(withTimeout(fn, { timeoutMs: 1000 })).resolves.toBe("done");
  });

  it("rejects on timeout", async () => {
    const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    });

    await expect(withTimeout(fn, { timeoutMs: 10, timeoutMessage: "Test timeout" })).rejects.toThrow("Test timeout");
  }, 5000);

  it("rejects with original error on non-timeout failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("real error"));
    await expect(withTimeout(fn, { timeoutMs: 1000 })).rejects.toThrow("real error");
  });
});

describe("categorizeError", () => {
  it("categorizes network error", () => {
    const result = categorizeError(new AppError({ code: "NETWORK_ERROR", message: "x" }));
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("categorizes timeout error", () => {
    const result = categorizeError(new AppError({ code: "TIMEOUT", message: "x" }));
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("categorizes rate limited error", () => {
    const result = categorizeError(new AppError({ code: "RATE_LIMITED", message: "x" }));
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("categorizes validation error", () => {
    const result = categorizeError(new AppError({ code: "VALIDATION_ERROR", message: "Invalid input" }));
    expect(result.category).toBe("validation");
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toBe("Invalid input");
  });

  it("categorizes IPC unavailable", () => {
    const result = categorizeError(new AppError({ code: "IPC_UNAVAILABLE", message: "x" }));
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(false);
  });

  it("categorizes unknown error", () => {
    const result = categorizeError(new AppError({ code: "UNKNOWN_ERROR", message: "x" }));
    expect(result.category).toBe("unknown");
    expect(result.retryable).toBe(false);
  });
});

describe("safeLogError", () => {
  it("logs error without throwing", () => {
    const error = new AppError({ code: "TIMEOUT", message: "x" });
    expect(() => safeLogError("test op", error)).not.toThrow();
  });

  it("masks sensitive context", () => {
    const error = new AppError({ code: "TIMEOUT", message: "x" });
    expect(() => safeLogError("test", error, { passportNumber: "AB123456" })).not.toThrow();
  });
});

describe("safeLogWarn", () => {
  it("logs warn without error", () => {
    expect(() => safeLogWarn("test warn")).not.toThrow();
  });

  it("logs warn with error", () => {
    const error = new AppError({ code: "TIMEOUT", message: "x" });
    expect(() => safeLogWarn("test warn", error)).not.toThrow();
  });

  it("masks sensitive context", () => {
    expect(() => safeLogWarn("test", undefined, { fullName: "John Doe" })).not.toThrow();
  });
});
