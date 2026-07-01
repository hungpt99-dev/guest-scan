import { describe, it, expect, vi, beforeEach } from "vitest";
import { OcrEngineManager } from "./ocr_engine";
import type { OcrEngine, OcrInput, OcrTextResult } from "./ocr_engine";

const MRZ_TD3_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const MRZ_TD3_LINE_2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<";

function createValidMrzResult(confidence: number = 0.95): OcrTextResult {
  return {
    lines: [
      { text: MRZ_TD3_LINE_1, confidence },
      { text: MRZ_TD3_LINE_2, confidence },
    ],
    fullText: [MRZ_TD3_LINE_1, MRZ_TD3_LINE_2].join("\n"),
    averageConfidence: confidence,
  };
}

function createGarbageResult(confidence: number = 0.4): OcrTextResult {
  return {
    lines: [{ text: "XYZ123", confidence }],
    fullText: "XYZ123",
    averageConfidence: confidence,
  };
}

function createEmptyResult(): OcrTextResult {
  return {
    lines: [],
    fullText: "",
    averageConfidence: 0,
  };
}

function createMockEngine(result?: OcrTextResult, shouldFail: boolean = false): OcrEngine {
  return {
    extractText: vi.fn().mockImplementation(async (_input: OcrInput) => {
      if (shouldFail) throw new Error("Engine failed");
      return result ?? createValidMrzResult();
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

describe("OcrEngineManager", () => {
  const mockInput: OcrInput = { imagePath: "/tmp/test.png" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractWithMultiPass", () => {
    it("runs all variants and selects the best result", async () => {
      const paddleMock = createMockEngine();
      const manager = new OcrEngineManager(paddleMock as never);

      const result = await manager.extractWithMultiPass(mockInput);

      expect(result.allResults.length).toBeGreaterThan(0);
      expect(result.bestResult).toBeDefined();
      expect(result.bestResult.result.averageConfidence).toBeGreaterThan(0);
      expect(paddleMock.extractText).toHaveBeenCalledTimes(4);
    });

    it("prefers result with valid MRZ over higher confidence without MRZ", async () => {
      const garbageResult = createGarbageResult(0.9);
      const validMrzResult = createValidMrzResult(0.7);

      let callCount = 0;
      const paddleMock: OcrEngine = {
        extractText: vi.fn().mockImplementation(async () => {
          callCount++;
          return callCount === 1 ? validMrzResult : garbageResult;
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const manager = new OcrEngineManager(paddleMock as never, undefined, undefined, {
        mrzValidationWeight: 0.4,
        confidenceWeight: 0.6,
        variants: [
          { name: "standard", description: "Standard" },
          { name: "high_contrast", description: "High contrast" },
        ],
      });

      const result = await manager.extractWithMultiPass(mockInput);

      const sortedByScore = [...result.allResults].sort((a, b) => b.score - a.score);
      expect(sortedByScore[0]!.mrzValid).toBe(true);
    });

    it("falls back to Tesseract when PaddleOCR fails", async () => {
      const failingPaddle: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("PaddleOCR crashed")),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const tesseractMock = createMockEngine(createValidMrzResult(0.85));

      const manager = new OcrEngineManager(failingPaddle as never, tesseractMock as never);

      const result = await manager.extractWithMultiPass(mockInput);

      expect(result.fallbackTriggered).toBe(true);
      expect(result.engineUsed).toBe("tesseract");
      expect(result.bestResult.result.averageConfidence).toBeGreaterThan(0);
    });

    it("falls back through all configured engines", async () => {
      const failingPaddle: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("Paddle failed")),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const failingTesseract: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("Tesseract failed")),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const easyOcrMock = createMockEngine(createValidMrzResult(0.8));

      const manager = new OcrEngineManager(failingPaddle as never, failingTesseract as never, easyOcrMock as never);

      const result = await manager.extractWithMultiPass(mockInput);

      expect(result.fallbackTriggered).toBe(true);
      expect(result.engineUsed).toBe("easyocr");
      expect(result.bestResult.result.averageConfidence).toBe(0.8);
    });

    it("throws when all engines fail", async () => {
      const failingPaddle: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("Paddle failed")),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const failingTesseract: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("Tesseract failed")),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const manager = new OcrEngineManager(failingPaddle as never, failingTesseract as never);

      await expect(manager.extractWithMultiPass(mockInput)).rejects.toThrow(
        "All OCR engines failed to produce a result",
      );
    });

    it("skips variants that produce empty results", async () => {
      let callCount = 0;
      const paddleMock: OcrEngine = {
        extractText: vi.fn().mockImplementation(async () => {
          callCount++;
          return callCount % 2 === 0 ? createEmptyResult() : createValidMrzResult();
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const manager = new OcrEngineManager(paddleMock as never, undefined, undefined, {
        variants: [
          { name: "standard", description: "Standard" },
          { name: "high_contrast", description: "High contrast" },
        ],
      });

      const result = await manager.extractWithMultiPass(mockInput);

      expect(result.allResults.length).toBeGreaterThan(0);
      expect(result.allResults.every((r) => r.result.lines.length > 0)).toBe(true);
    });
  });

  describe("extractText", () => {
    it("returns the best result from multi-pass", async () => {
      const paddleMock = createMockEngine(createValidMrzResult(0.92));
      const manager = new OcrEngineManager(paddleMock as never);

      const result = await manager.extractText(mockInput);

      expect(result.averageConfidence).toBe(0.92);
      expect(result.fullText).toContain("P<UTOMUSTER");
    });
  });

  describe("extractWithAllEngines", () => {
    it("tries all configured engines and returns sorted results", async () => {
      const lowConfResult = createValidMrzResult(0.5);
      const highConfResult = createValidMrzResult(0.95);

      let paddleCallCount = 0;
      const paddleMock: OcrEngine = {
        extractText: vi.fn().mockImplementation(async () => {
          paddleCallCount++;
          return paddleCallCount <= 2 ? highConfResult : lowConfResult;
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const tesseractMock = createMockEngine(lowConfResult);

      const manager = new OcrEngineManager(paddleMock as never, tesseractMock as never, undefined, {
        variants: [
          { name: "standard", description: "Standard" },
          { name: "high_contrast", description: "High contrast" },
        ],
      });

      const allResults = await manager.extractWithAllEngines(mockInput);

      expect(allResults.length).toBeGreaterThan(0);
      for (let i = 1; i < allResults.length; i++) {
        expect(allResults[i - 1]!.score).toBeGreaterThanOrEqual(allResults[i]!.score);
      }
    });

    it("does not duplicate primary and fallback engine type", async () => {
      const paddleMock = createMockEngine(createValidMrzResult(0.9));
      const tesseractMock = createMockEngine(createValidMrzResult(0.8));

      const variants = [
        { name: "standard", description: "Standard" },
        { name: "high_contrast", description: "High contrast" },
      ];

      const manager = new OcrEngineManager(paddleMock as never, tesseractMock as never, undefined, {
        variants,
        primaryEngine: "paddle",
        fallbackEngines: ["tesseract"],
      });

      const allResults = await manager.extractWithAllEngines(mockInput);

      const engineVariantPairs = new Set(allResults.map((r) => `${r.engineType}:${r.variantName}`));
      expect(engineVariantPairs.size).toBe(allResults.length);
    });
  });

  describe("config", () => {
    it("accepts custom confidence threshold", () => {
      const manager = new OcrEngineManager(undefined, undefined, undefined, {
        confidenceThreshold: 0.8,
      });

      expect(manager).toBeInstanceOf(OcrEngineManager);
    });

    it("accepts custom preprocessing variants", () => {
      const variants = [{ name: "only_standard", description: "Just standard" }];
      const manager = new OcrEngineManager(undefined, undefined, undefined, {
        variants,
      });

      expect(manager).toBeInstanceOf(OcrEngineManager);
    });

    it("setConfig updates configuration", () => {
      const manager = new OcrEngineManager();
      manager.setConfig({ confidenceThreshold: 0.9 });

      expect(manager).toBeInstanceOf(OcrEngineManager);
    });
  });

  describe("fallback scenarios", () => {
    it("skips engine that is not available", async () => {
      const paddleMock: OcrEngine = {
        extractText: vi.fn().mockRejectedValue(new Error("Should not be called")),
        isAvailable: vi.fn().mockResolvedValue(false),
      };

      const tesseractMock = createMockEngine(createValidMrzResult(0.88));

      const manager = new OcrEngineManager(paddleMock as never, tesseractMock as never);

      const result = await manager.extractWithMultiPass(mockInput);

      expect(result.engineUsed).toBe("tesseract");
      expect(paddleMock.extractText).not.toHaveBeenCalled();
    });

    it("uses fallback engine results when primary engine produces low confidence results", async () => {
      const lowConfResult = createGarbageResult(0.3);
      const validResult = createValidMrzResult(0.82);

      const paddleMock: OcrEngine = {
        extractText: vi.fn().mockResolvedValue(lowConfResult),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const tesseractMock: OcrEngine = {
        extractText: vi.fn().mockResolvedValue(validResult),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const manager = new OcrEngineManager(paddleMock as never, tesseractMock as never, undefined, {
        variants: [{ name: "standard", description: "Standard" }],
      });

      const allResults = await manager.extractWithAllEngines(mockInput);

      const paddleResults = allResults.filter((r) => r.engineType === "paddle");
      const tessResults = allResults.filter((r) => r.engineType === "tesseract");

      expect(paddleResults.length).toBe(1);
      expect(paddleResults[0]!.result.averageConfidence).toBe(0.3);
      expect(paddleResults[0]!.mrzValid).toBe(false);

      expect(tessResults.length).toBe(1);
      expect(tessResults[0]!.result.averageConfidence).toBe(0.82);
      expect(tessResults[0]!.mrzValid).toBe(true);

      expect(allResults[0]!.mrzValid).toBe(true);
      expect(allResults[0]!.result.averageConfidence).toBe(0.82);
    });
  });
});
