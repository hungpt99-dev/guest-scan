import { describe, it, expect, vi, beforeEach } from "vitest";
import { OcrProviderRegistry, runOcrWithFallback } from "../../ocr/provider-registry";
import type { OcrProvider, OcrResult } from "@guestfill/shared";

function createMockProvider(
  name: string,
  type: "LOCAL" | "AZURE",
  available: boolean = true,
  shouldFail: boolean = false,
): OcrProvider {
  return {
    name,
    type,
    isAvailable: vi.fn().mockResolvedValue(available),
    processImage: vi.fn().mockImplementation(async (_imagePath: string) => {
      if (shouldFail) throw new Error(`${name} failed`);
      return {
        fields: {},
        rawText: "",
        overallConfidence: 0.95,
        overallConfidenceLevel: "HIGH",
        provider: type,
        warnings: [],
        processingTimeMs: 50,
      } as OcrResult;
    }),
    cancel: vi.fn(),
  };
}

describe("OcrProviderRegistry", () => {
  let registry: OcrProviderRegistry;

  beforeEach(() => {
    registry = new OcrProviderRegistry();
  });

  describe("register", () => {
    it("registers a provider factory", () => {
      const factory = () => createMockProvider("Local", "LOCAL");
      registry.register("LOCAL", factory);
      const types = registry.getRegisteredTypes();
      expect(types).toContain("LOCAL");
    });

    it("overwrites existing registration", () => {
      const factory1 = () => createMockProvider("Local1", "LOCAL");
      const factory2 = () => createMockProvider("Local2", "LOCAL");
      registry.register("LOCAL", factory1);
      registry.register("LOCAL", factory2);
      const provider = registry.getProvider("LOCAL");
      expect(provider.name).toBe("Local2");
    });
  });

  describe("unregister", () => {
    it("removes a registered provider", () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"));
      registry.unregister("LOCAL");
      expect(() => registry.getProvider("LOCAL")).toThrow("No OCR provider registered");
    });
  });

  describe("getProvider", () => {
    it("returns a provider instance", () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"));
      const provider = registry.getProvider("LOCAL");
      expect(provider.name).toBe("Local");
    });

    it("caches provider instances", () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"));
      const a = registry.getProvider("LOCAL");
      const b = registry.getProvider("LOCAL");
      expect(a).toBe(b);
    });

    it("throws for unregistered type", () => {
      expect(() => registry.getProvider("AZURE")).toThrow("No OCR provider registered");
    });
  });

  describe("getRegisteredTypes", () => {
    it("returns empty array initially", () => {
      expect(registry.getRegisteredTypes()).toEqual([]);
    });

    it("returns registered types", () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"));
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE"));
      const types = registry.getRegisteredTypes();
      expect(types).toContain("LOCAL");
      expect(types).toContain("AZURE");
    });
  });

  describe("getAvailableProviders", () => {
    it("returns providers sorted by priority", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true), 10);
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE", true), 20);
      const available = await registry.getAvailableProviders();
      expect(available).toHaveLength(2);
      expect(available[0]!.type).toBe("AZURE");
      expect(available[1]!.type).toBe("LOCAL");
    });

    it("filters out unavailable providers", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true), 10);
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE", false), 20);
      const available = await registry.getAvailableProviders();
      expect(available).toHaveLength(1);
      expect(available[0]!.type).toBe("LOCAL");
    });

    it("handles provider that throws during availability check", async () => {
      const throwingProvider: OcrProvider = {
        name: "Broken",
        type: "AZURE" as const,
        isAvailable: vi.fn().mockRejectedValue(new Error("Not configured")),
        processImage: vi.fn(),
        cancel: vi.fn(),
      };
      registry.register("AZURE", () => throwingProvider, 20);
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true), 10);
      const available = await registry.getAvailableProviders();
      expect(available).toHaveLength(1);
    });
  });

  describe("selectBestProvider", () => {
    it("returns preferred provider when available", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true), 10);
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE", true), 20);
      const provider = await registry.selectBestProvider("LOCAL");
      expect(provider.type).toBe("LOCAL");
    });

    it("falls back when preferred provider is unavailable", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", false), 10);
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE", true), 20);
      const provider = await registry.selectBestProvider("LOCAL");
      expect(provider.type).toBe("AZURE");
    });

    it("returns highest priority available provider without preference", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true), 10);
      registry.register("AZURE", () => createMockProvider("Azure", "AZURE", true), 20);
      const provider = await registry.selectBestProvider();
      expect(provider.type).toBe("AZURE");
    });

    it("throws when no providers available", async () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", false), 10);
      await expect(registry.selectBestProvider()).rejects.toThrow("No OCR providers are available");
    });

    it("throws when no providers registered", async () => {
      await expect(registry.selectBestProvider()).rejects.toThrow("No OCR providers are available");
    });
  });

  describe("clearInstances", () => {
    it("clears cached instances", () => {
      registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"));
      const a = registry.getProvider("LOCAL");
      registry.clearInstances();
      const b = registry.getProvider("LOCAL");
      expect(a).not.toBe(b);
    });
  });
});

describe("runOcrWithFallback", () => {
  let registry: OcrProviderRegistry;

  beforeEach(() => {
    registry = new OcrProviderRegistry();
  });

  it("uses preferred provider when available", async () => {
    registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"), 10);
    registry.register("AZURE", () => createMockProvider("Azure", "AZURE"), 20);

    const result = await runOcrWithFallback("/tmp/test.jpg", registry, "LOCAL");
    expect(result.provider).toBe("LOCAL");
    expect(result.usedFallback).toBe(false);
    expect(result.fallbackChain).toEqual(["LOCAL"]);
  });

  it("falls back to next provider when preferred fails", async () => {
    registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true, true), 10);
    registry.register("AZURE", () => createMockProvider("Azure", "AZURE"), 20);

    const result = await runOcrWithFallback("/tmp/test.jpg", registry, "LOCAL");
    expect(result.provider).toBe("AZURE");
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackChain).toContain("LOCAL");
    expect(result.fallbackChain).toContain("AZURE");
  });

  it("throws when all providers fail", async () => {
    registry.register("LOCAL", () => createMockProvider("Local", "LOCAL", true, true), 10);
    registry.register("AZURE", () => createMockProvider("Azure", "AZURE", true, true), 20);

    await expect(runOcrWithFallback("/tmp/test.jpg", registry)).rejects.toThrow();
  });

  it("throws AbortError when signal is aborted before processing", async () => {
    registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"), 10);
    const controller = new AbortController();
    controller.abort();

    await expect(runOcrWithFallback("/tmp/test.jpg", registry, undefined, controller.signal)).rejects.toThrow(
      "OCR was canceled",
    );
  });

  it("re-throws AbortError during processing", async () => {
    const abortingProvider: OcrProvider = {
      name: "Aborting",
      type: "LOCAL" as const,
      isAvailable: vi.fn().mockResolvedValue(true),
      processImage: vi.fn().mockRejectedValue(new DOMException("Canceled", "AbortError")),
      cancel: vi.fn(),
    };
    registry.register("LOCAL", () => abortingProvider, 10);

    const controller = new AbortController();
    const promise = runOcrWithFallback("/tmp/test.jpg", registry, undefined, controller.signal);
    controller.abort();
    // The test expects AbortError to propagate
    await expect(promise).rejects.toThrow();
  });

  it("returns result from only registered provider with no preferred", async () => {
    registry.register("LOCAL", () => createMockProvider("Local", "LOCAL"), 10);
    const result = await runOcrWithFallback("/tmp/test.jpg", registry);
    expect(result.provider).toBe("LOCAL");
    expect(result.result).toBeDefined();
  });
});
