import { describe, it, expect, vi, beforeEach } from "vitest";
import { TesseractOcrEngine } from "../../ocr/tesseract_ocr_engine";
import type { OcrInput } from "../../ocr/ocr_engine";

vi.mock("../../lib/isTauri", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: vi.fn(),
}));

describe("TesseractOcrEngine", () => {
  let engine: TesseractOcrEngine;
  const mockInput: OcrInput = { imagePath: "/tmp/test.png" };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TesseractOcrEngine();
  });

  describe("extractText", () => {
    it("returns mapped OcrTextResult from Tauri invoke result", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_tesseract_available") return true;
        if (cmd === "extract_tesseract_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
              { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.85 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]!.text).toBe("P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<");
      expect(result.lines[0]!.confidence).toBe(0.88);
      expect(result.lines[1]!.text).toBe("AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04");
      expect(result.lines[1]!.confidence).toBe(0.85);
      expect(result.fullText).toContain("P<UTOMUSTER");
      expect(result.averageConfidence).toBeCloseTo(0.865, 3);
    });

    it("filters MRZ invalid characters from result text", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_tesseract_available") return true;
        if (cmd === "extract_tesseract_mrz") {
          return {
            text: "abc def ghi",
            chunks: [{ text: "abc def ghi", confidence: 0.9 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.lines[0]!.text).toBe("ABCDEFGHI");
    });

    it("calculates average confidence across lines", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_tesseract_available") return true;
        if (cmd === "extract_tesseract_mrz") {
          return {
            text: "line1\nline2",
            chunks: [
              { text: "line1", confidence: 0.7 },
              { text: "line2", confidence: 0.9 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.averageConfidence).toBeCloseTo(0.8, 2);
    });

    it("returns zero average confidence when no lines", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_tesseract_available") return true;
        if (cmd === "extract_tesseract_mrz") {
          return { text: "", chunks: [] };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const result = await engine.extractText(mockInput);

      expect(result.averageConfidence).toBe(0);
      expect(result.lines).toHaveLength(0);
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

      await expect(engine.extractText(mockInput)).rejects.toThrow("Tesseract OCR engine is not available");
    });

    it("throws error when invoke call fails during OCR", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_tesseract_available") return true;
        throw new Error("IPC failed");
      });

      await expect(engine.extractText(mockInput)).rejects.toThrow();
    });
  });
});
