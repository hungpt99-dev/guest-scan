import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaddleOcrEngine } from "../../ocr/paddle_ocr_engine";
import type { OcrInput } from "../../ocr/ocr_engine";
import type { TesseractOcrEngine } from "../../ocr/tesseract_ocr_engine";

vi.mock("../../lib/isTauri", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: vi.fn(),
}));

function createMockTesseractEngine(): TesseractOcrEngine {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    extractText: vi.fn(),
  } as unknown as TesseractOcrEngine;
}

describe("PaddleOcrEngine", () => {
  let engine: PaddleOcrEngine;
  const mockInput: OcrInput = { imagePath: "/tmp/test.png" };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PaddleOcrEngine();
  });

  describe("extractText", () => {
    it("returns mapped OcrTextResult from Tauri invoke result", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.92 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]!.text).toBe("P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<");
      expect(result.lines[0]!.confidence).toBe(0.95);
      expect(result.lines[1]!.text).toBe("AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04");
      expect(result.lines[1]!.confidence).toBe(0.92);
      expect(result.fullText).toContain("P<UTOMUSTER");
      expect(result.fullText).toContain("AB123456");
      expect(result.averageConfidence).toBeCloseTo(0.935, 3);
    });

    it("filters MRZ invalid characters from result text", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTO MUSTER JOHN",
            chunks: [{ text: "P<UTO MUSTER JOHN", confidence: 0.9 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.lines[0]!.text).toBe("P<UTOMUSTERJOHN");
    });

    it("calculates average confidence across lines", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "line1\nline2",
            chunks: [
              { text: "line1", confidence: 0.8 },
              { text: "line2", confidence: 0.9 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.averageConfidence).toBeCloseTo(0.85, 2);
    });

    it("returns zero average confidence when no lines", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return { text: "", chunks: [] };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.averageConfidence).toBe(0);
      expect(result.lines).toHaveLength(0);
    });

    it("removes non-MRZ characters like lowercase, punctuation", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "ab c!@#",
            chunks: [{ text: "ab c!@#", confidence: 0.95 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.lines[0]!.text).toBe("ABC");
    });

    it("falls back to Tesseract when PaddleOCR invocation fails", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        throw new Error("PaddleOCR IPC failed");
      });

      const tesseractEngine = createMockTesseractEngine();
      vi.mocked(tesseractEngine.extractText).mockResolvedValue({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
          { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.85 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
        averageConfidence: 0.865,
      });

      engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText(mockInput);

      expect(tesseractEngine.extractText).toHaveBeenCalledWith(mockInput);
      expect(result.averageConfidence).toBeCloseTo(0.865, 3);
    });

    it("falls back to Tesseract when PaddleOCR confidence is below threshold", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "blurry text",
            chunks: [{ text: "blurry text", confidence: 0.3 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const tesseractEngine = createMockTesseractEngine();
      vi.mocked(tesseractEngine.extractText).mockResolvedValue({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
          { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.85 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
        averageConfidence: 0.865,
      });

      engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText(mockInput);

      expect(tesseractEngine.extractText).toHaveBeenCalledWith(mockInput);
      expect(result.averageConfidence).toBeCloseTo(0.865, 3);
    });

    it("keeps PaddleOCR result when Tesseract fallback has lower confidence", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "blurry text",
            chunks: [{ text: "blurry text", confidence: 0.4 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const tesseractEngine = createMockTesseractEngine();
      vi.mocked(tesseractEngine.extractText).mockResolvedValue({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.3 },
          { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.28 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
        averageConfidence: 0.29,
      });

      engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText(mockInput);

      expect(tesseractEngine.extractText).toHaveBeenCalled();
      expect(result.averageConfidence).toBeCloseTo(0.4, 3);
    });

    it("throws when both engines are unavailable and no fallback configured", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return false;
        throw new Error(`Unknown command: ${cmd}`);
      });

      await expect(engine.extractText(mockInput)).rejects.toThrow("PaddleOCR engine is not available");
    });

    it("throws when both PaddleOCR and Tesseract fallback fail", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        throw new Error("PaddleOCR IPC failed");
      });

      const tesseractEngine = createMockTesseractEngine();
      vi.mocked(tesseractEngine.extractText).mockRejectedValue(new Error("Tesseract unavailable"));

      engine = new PaddleOcrEngine(tesseractEngine);
      await expect(engine.extractText(mockInput)).rejects.toThrow("PaddleOCR IPC failed");
    });
  });

  describe("extractTextWithFields", () => {
    it("returns per-field confidence for TD3 MRZ format", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.92 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractTextWithFields(mockInput);

      expect(result.fields).toBeDefined();
      expect(result.usedFallback).toBe(false);
      expect(result.averageConfidence).toBeCloseTo(0.935, 3);

      const passportField = result.fields!.find((f) => f.name === "passportNumber");
      expect(passportField).toBeDefined();
      expect(passportField!.value).toBe("AB123456");
      expect(passportField!.confidence).toBe(0.92);

      const nameField = result.fields!.find((f) => f.name === "surname");
      expect(nameField).toBeDefined();
      expect(nameField!.value).toBe("MUSTER");
      expect(nameField!.confidence).toBe(0.95);
    });

    it("returns per-field confidence for TD1 MRZ format", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<\n<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
            chunks: [
              { text: "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<", confidence: 0.94 },
              { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<", confidence: 0.91 },
              { text: "<<<<<<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractTextWithFields(mockInput);

      expect(result.fields).toBeDefined();
      expect(result.fields!.length).toBeGreaterThan(0);

      const passportField = result.fields!.find((f) => f.name === "passportNumber");
      expect(passportField).toBeDefined();
      expect(passportField!.value).toBe("AB123456");
      expect(passportField!.confidence).toBe(0.91);

      const dateField = result.fields!.find((f) => f.name === "dateOfBirth");
      expect(dateField).toBeDefined();
      expect(dateField!.value).toBe("851010");
    });

    it("returns empty fields array when no OCR lines", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return { text: "", chunks: [] };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractTextWithFields(mockInput);

      expect(result.fields).toEqual([]);
      expect(result.averageConfidence).toBe(0);
    });

    it("sets usedFallback to true when Tesseract fallback is used", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "low quality text",
            chunks: [{ text: "low quality text", confidence: 0.25 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const tesseractEngine = createMockTesseractEngine();
      vi.mocked(tesseractEngine.extractText).mockResolvedValue({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
          { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.85 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
        averageConfidence: 0.865,
      });

      engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractTextWithFields(mockInput);

      expect(result.usedFallback).toBe(true);
      expect(result.averageConfidence).toBeCloseTo(0.865, 3);
    });
  });

  describe("isAvailable", () => {
    it("returns true when Tauri invoke reports available", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockResolvedValue(true);

      const available = await engine.isAvailable();

      expect(available).toBe(true);
    });

    it("returns false when Tauri invoke reports unavailable", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockResolvedValue(false);

      const available = await engine.isAvailable();

      expect(available).toBe(false);
    });

    it("returns false when Tauri invoke throws", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockRejectedValue(new Error("IPC error"));

      const available = await engine.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe("error handling", () => {
    it("throws error when engine is not available", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockResolvedValue(false);

      await expect(engine.extractText(mockInput)).rejects.toThrow("PaddleOCR engine is not available");
    });

    it("throws error when invoke call fails during OCR and no fallback", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        throw new Error("IPC failed");
      });

      await expect(engine.extractText(mockInput)).rejects.toThrow();
    });
  });

  describe("constructor", () => {
    it("accepts a TesseractOcrEngine for fallback", () => {
      const tesseractEngine = createMockTesseractEngine();
      const customEngine = new PaddleOcrEngine(tesseractEngine, 0.5);
      expect(customEngine).toBeInstanceOf(PaddleOcrEngine);
    });

    it("uses default confidence threshold when not specified", () => {
      const engineWithDefault = new PaddleOcrEngine();
      expect(engineWithDefault).toBeInstanceOf(PaddleOcrEngine);
    });
  });
});
