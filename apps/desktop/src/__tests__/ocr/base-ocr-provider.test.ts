import { describe, it, expect, vi } from "vitest";
import { BaseOcrProvider } from "../../ocr/base-ocr-provider";
import type { OcrResult, OcrProviderType } from "@guestfill/shared";

class TestProvider extends BaseOcrProvider {
  readonly name = "TestProvider";
  readonly type: OcrProviderType = "LOCAL";

  protected async checkAvailability(): Promise<boolean> {
    return true;
  }

  async processImage(_imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    this.checkCanceled();
    this.setupAbortSignal(signal);
    this.ensureAvailable();
    this.checkCanceled();

    return {
      fields: {},
      rawText: "",
      overallConfidence: 0.95,
      overallConfidenceLevel: "HIGH",
      provider: this.type,
      warnings: [],
      processingTimeMs: 10,
    };
  }
}

class UnavailableProvider extends BaseOcrProvider {
  readonly name = "UnavailableProvider";
  readonly type: OcrProviderType = "AZURE";

  protected async checkAvailability(): Promise<boolean> {
    return false;
  }

  async processImage(_imagePath: string, _signal?: AbortSignal): Promise<OcrResult> {
    await this.ensureAvailable();
    throw new Error("Should not reach here");
  }
}

class ThrowingProvider extends BaseOcrProvider {
  readonly name = "ThrowingProvider";
  readonly type: OcrProviderType = "LOCAL";

  protected async checkAvailability(): Promise<boolean> {
    throw new Error("Init failed");
  }

  async processImage(_imagePath: string, _signal?: AbortSignal): Promise<OcrResult> {
    throw new Error("Should not reach here");
  }
}

class SlowProvider extends BaseOcrProvider {
  readonly name = "SlowProvider";
  readonly type: OcrProviderType = "LOCAL";

  protected async checkAvailability(): Promise<boolean> {
    return true;
  }

  async processImage(_imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    this.checkCanceled();
    const cleanup = this.setupAbortSignal(signal);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.checkCanceled();
      return {
        fields: {},
        rawText: "",
        overallConfidence: 0.95,
        overallConfidenceLevel: "HIGH",
        provider: this.type,
        warnings: [],
      };
    } finally {
      if (cleanup) cleanup();
    }
  }
}

describe("BaseOcrProvider", () => {
  describe("initialize", () => {
    it("initializes and sets available", async () => {
      const provider = new TestProvider();
      const available = await provider.initialize();
      expect(available).toBe(true);
      expect(provider.isAvailable()).toBe(true);
    });

    it("sets unavailable when checkAvailability returns false", async () => {
      const provider = new UnavailableProvider();
      const available = await provider.initialize();
      expect(available).toBe(false);
      expect(provider.isAvailable()).toBe(false);
    });

    it("sets unavailable when initialize throws", async () => {
      const provider = new ThrowingProvider();
      const available = await provider.initialize();
      expect(available).toBe(false);
      expect(provider.isAvailable()).toBe(false);
    });

    it("does not re-initialize if already initialized", async () => {
      const provider = new TestProvider();
      await provider.initialize();
      const spy = vi.spyOn(provider as unknown as { checkAvailability: () => Promise<boolean> }, "checkAvailability");
      await provider.initialize();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("processImage", () => {
    it("processes image and returns result", async () => {
      const provider = new TestProvider();
      await provider.initialize();
      const result = await provider.processImage("/tmp/test.jpg");
      expect(result).toBeDefined();
      expect(result.provider).toBe("LOCAL");
    });

    it("throws if not initialized and unavailable", async () => {
      const provider = new UnavailableProvider();
      await expect(provider.processImage("/tmp/test.jpg")).rejects.toThrow("not available");
    });
  });

  describe("cancel", () => {
    it("cancels processing", () => {
      const provider = new TestProvider();
      provider.cancel();
      expect(provider.isAvailable()).toBe(false);
    });

    it("throws AbortError after cancel on checkCanceled", async () => {
      const provider = new TestProvider();
      provider.cancel();
      await expect(provider.processImage("/tmp/test.jpg")).rejects.toThrow("OCR was canceled");
    });
  });

  describe("destroy", () => {
    it("resets state after destroy", async () => {
      const provider = new TestProvider();
      await provider.initialize();
      expect(provider.isAvailable()).toBe(true);

      await provider.destroy();
      expect(provider.isAvailable()).toBe(false);
    });

    it("allows re-initialization after destroy", async () => {
      const provider = new TestProvider();
      await provider.initialize();
      await provider.destroy();
      const available = await provider.initialize();
      expect(available).toBe(true);
    });
  });

  describe("setupAbortSignal", () => {
    it("sets canceled when signal is already aborted", () => {
      const provider = new TestProvider();
      const controller = new AbortController();
      controller.abort();
      provider["setupAbortSignal"](controller.signal);
      expect(provider["canceled"]).toBe(true);
    });

    it("listens to abort event on signal", () => {
      const provider = new TestProvider();
      const controller = new AbortController();
      const cleanup = provider["setupAbortSignal"](controller.signal);
      expect(cleanup).toBeDefined();
      controller.abort();
      expect(provider["canceled"]).toBe(true);
      if (cleanup) cleanup();
    });

    it("returns undefined when no signal provided", () => {
      const provider = new TestProvider();
      expect(provider["setupAbortSignal"]()).toBeUndefined();
    });

    it("cleans up abort listener", () => {
      const provider = new TestProvider();
      const controller = new AbortController();
      const cleanup = provider["setupAbortSignal"](controller.signal);
      expect(cleanup).toBeDefined();
      if (cleanup) cleanup();
      // Should not throw
      controller.abort();
    });
  });

  describe("AbortSignal integration", () => {
    it("respects AbortSignal during processing", async () => {
      const provider = new SlowProvider();
      const controller = new AbortController();
      const promise = provider.processImage("/tmp/test.jpg", controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow("OCR was canceled");
    });

    it("processes successfully without interruption", async () => {
      const provider = new TestProvider();
      await provider.initialize();
      const result = await provider.processImage("/tmp/test.jpg");
      expect(result.processingTimeMs).toBe(10);
    });
  });
});
