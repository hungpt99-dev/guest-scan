import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiClient, getApiClient, type ApiClient } from "../../api/client";
import { isOk, isErr } from "../../lib/result";

const mockInvokeIpc = vi.fn();
vi.mock("../../infra/ipc", () => ({
  invokeIpc: (...args: unknown[]) => mockInvokeIpc(...args),
}));

describe("ApiClient", () => {
  let client: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createApiClient({
      timeoutMs: 5000,
      retryCount: 1,
      retryDelayMs: 10,
    });
  });

  describe("invoke", () => {
    it("returns ok result on success", async () => {
      mockInvokeIpc.mockResolvedValue({ data: "test" });
      const result = await client.invoke<{ data: string }>("test_command");
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ data: "test" });
      }
    });

    it("returns err on failure", async () => {
      mockInvokeIpc.mockRejectedValue(new Error("Something broke"));
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("PIPELINE_FAILED");
      }
    });

    it("retries on timeout error", async () => {
      mockInvokeIpc.mockRejectedValueOnce(new DOMException("Aborted", "AbortError")).mockResolvedValueOnce("ok");
      const result = await client.invoke("test_command");
      expect(isOk(result)).toBe(true);
      expect(mockInvokeIpc).toHaveBeenCalledTimes(2);
    });

    it("retries on rate limited error", async () => {
      mockInvokeIpc
        .mockRejectedValueOnce({ code: "RATE_LIMITED", message: "Rate limited" })
        .mockResolvedValueOnce("ok");
      const result = await client.invoke("test_command");
      expect(isOk(result)).toBe(true);
      expect(mockInvokeIpc).toHaveBeenCalledTimes(2);
    });

    it("does not retry on non-retryable error", async () => {
      mockInvokeIpc.mockRejectedValue({ code: "VALIDATION_ERROR", message: "Validation failed" });
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      expect(mockInvokeIpc).toHaveBeenCalledTimes(1);
    });

    it("normalizes IPC_UNAVAILABLE error", async () => {
      mockInvokeIpc.mockRejectedValue({ code: "IPC_UNAVAILABLE", message: "Not connected" });
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("IPC_UNAVAILABLE");
        expect(result.error.message).toBe("Not connected");
      }
    });

    it("normalizes AbortError to TIMEOUT", async () => {
      mockInvokeIpc.mockRejectedValue(new DOMException("Timed out", "AbortError"));
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("TIMEOUT");
      }
    });

    it("handles unknown error objects", async () => {
      mockInvokeIpc.mockRejectedValue({ code: "CUSTOM_ERROR", message: "Custom" });
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("CUSTOM_ERROR");
        expect(result.error.message).toBe("Custom");
      }
    });

    it("handles non-object errors with fallback", async () => {
      mockInvokeIpc.mockRejectedValue("string error");
      const result = await client.invoke("test_command");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("PIPELINE_FAILED");
      }
    });
  });

  describe("getApiClient", () => {
    it("returns a singleton instance", () => {
      const a = getApiClient();
      const b = getApiClient();
      expect(a).toBe(b);
    });

    it("provides working invoke method", () => {
      const instance = getApiClient();
      expect(typeof instance.invoke).toBe("function");
    });
  });

  describe("createApiClient", () => {
    it("creates client with custom config", () => {
      const customClient = createApiClient({ timeoutMs: 10000, retryCount: 3 });
      expect(customClient).toBeDefined();
      expect(typeof customClient.invoke).toBe("function");
    });
  });
});
