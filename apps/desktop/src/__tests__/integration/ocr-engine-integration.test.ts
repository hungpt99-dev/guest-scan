import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockOcrEngine } from "../../ocr/mock_ocr_engine";
import { PaddleOcrEngine } from "../../ocr/paddle_ocr_engine";
import type { OcrEngine, OcrInput, OcrTextResult } from "../../ocr/ocr_engine";
import type { TesseractOcrEngine } from "../../ocr/tesseract_ocr_engine";
import { createMrzParserService } from "../../services/mrz_parser_service";
import { createMrzChecksumValidator } from "../../services/mrz_checksum_validator";
import { createFieldNormalizationService } from "../../services/field_normalization_service";
import { createOcrConfidenceService } from "../../services/ocr_confidence_service";
import type { OcrFieldResults } from "../../ocr/paddle_ocr_engine";

vi.mock("../../lib/isTauri", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: vi.fn(),
}));

function makeTd3MrzLines(): OcrTextResult {
  return {
    lines: [
      { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
      { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
    ],
    fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    averageConfidence: 0.94,
  };
}

function makeTd1MrzLines(): OcrTextResult {
  return {
    lines: [
      { text: "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<", confidence: 0.94 },
      { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<", confidence: 0.91 },
      { text: "<<<<<<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
    ],
    fullText:
      "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<\n<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    averageConfidence: 0.91,
  };
}

describe("OCR Engine Abstraction Integration", () => {
  describe("all engines implement OcrEngine interface", () => {
    it("MockOcrEngine conforms to OcrEngine contract", async () => {
      const engine: OcrEngine = new MockOcrEngine();
      const input: OcrInput = { imagePath: "/tmp/test.jpg" };
      const result = await engine.extractText(input);
      expect(result).toHaveProperty("lines");
      expect(result).toHaveProperty("fullText");
      expect(result).toHaveProperty("averageConfidence");
      expect(Array.isArray(result.lines)).toBe(true);
    });

    it("PaddleOcrEngine conforms to OcrEngine contract", () => {
      const engine: OcrEngine = new PaddleOcrEngine();
      expect(engine).toHaveProperty("extractText");
      expect(typeof engine.extractText).toBe("function");
    });

    it("PaddleOcrEngine conforms to OcrFieldResults contract via extractTextWithFields", () => {
      const engine = new PaddleOcrEngine();
      expect(engine).toHaveProperty("extractTextWithFields");
      expect(typeof engine.extractTextWithFields).toBe("function");
    });
  });

  describe("engine result mapping", () => {
    it("maps raw OCR chunks to OcrTextResult correctly", async () => {
      const engine = new MockOcrEngine(makeTd3MrzLines());
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]!.text).toContain("P<UTO");
      expect(result.lines[1]!.text).toContain("AB123456");
      expect(result.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.averageConfidence).toBeLessThanOrEqual(1);
    });

    it("computes average confidence across all lines", async () => {
      const engine = new MockOcrEngine({
        lines: [
          { text: "LINE1", confidence: 0.9 },
          { text: "LINE2", confidence: 0.8 },
          { text: "LINE3", confidence: 0.7 },
        ],
        fullText: "LINE1\nLINE2\nLINE3",
        averageConfidence: 0.8,
      });
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      expect(result.lines).toHaveLength(3);
      expect(result.averageConfidence).toBe(0.8);
    });

    it("handles empty OCR result", async () => {
      const engine = new MockOcrEngine({
        lines: [],
        fullText: "",
        averageConfidence: 0,
      });
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      expect(result.lines).toHaveLength(0);
      expect(result.fullText).toBe("");
      expect(result.averageConfidence).toBe(0);
    });
  });

  describe("PaddleOcrEngine field confidence mapping (TD3)", () => {
    it("maps TD3 fields with correct confidence per field", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const engine = new PaddleOcrEngine();
      const result = (await engine.extractTextWithFields({
        imagePath: "/tmp/test.jpg",
      })) as OcrFieldResults;

      expect(result.fields).toBeDefined();
      expect(result.usedFallback).toBe(false);

      const surname = result.fields!.find((f) => f.name === "surname");
      expect(surname).toBeDefined();
      expect(surname!.value).toBe("MUSTER");
      expect(surname!.confidence).toBe(0.95);

      const passport = result.fields!.find((f) => f.name === "passportNumber");
      expect(passport).toBeDefined();
      expect(passport!.value).toBe("AB123456");
      expect(passport!.confidence).toBe(0.93);

      const gender = result.fields!.find((f) => f.name === "gender");
      expect(gender).toBeDefined();
      expect(gender!.value).toBe("M");

      const issuingCountry = result.fields!.find((f) => f.name === "issuingCountry");
      expect(issuingCountry).toBeDefined();
      expect(issuingCountry!.value).toBe("UTO");
    });

    it("maps TD3 expiry date and date of birth correctly", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const engine = new PaddleOcrEngine();
      const result = (await engine.extractTextWithFields({
        imagePath: "/tmp/test.jpg",
      })) as OcrFieldResults;

      const dob = result.fields!.find((f) => f.name === "dateOfBirth");
      expect(dob!.value).toBe("851010");

      const expiry = result.fields!.find((f) => f.name === "expiryDate");
      expect(expiry!.value).toBe("200101");
    });

    it("penalizes confidence for empty filler-only fields", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const engine = new PaddleOcrEngine();
      const result = (await engine.extractTextWithFields({
        imagePath: "/tmp/test.jpg",
      })) as OcrFieldResults;

      const optionalData = result.fields!.find((f) => f.name === "optionalData");
      expect(optionalData).toBeDefined();
      expect(optionalData!.confidence).toBeLessThan(0.93);
    });
  });

  describe("PaddleOcrEngine field confidence mapping (TD1)", () => {
    it("maps TD1 fields with 3-line MRZ", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<\n<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
            chunks: [
              { text: "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<", confidence: 0.94 },
              { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<", confidence: 0.91 },
              { text: "<<<<<<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.88 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const engine = new PaddleOcrEngine();
      const result = (await engine.extractTextWithFields({
        imagePath: "/tmp/test.jpg",
      })) as OcrFieldResults;

      expect(result.fields).toBeDefined();
      expect(result.fields!.length).toBeGreaterThanOrEqual(9);

      const surname = result.fields!.find((f) => f.name === "surname");
      expect(surname!.value).toBe("MUSTER");

      const expiry = result.fields!.find((f) => f.name === "expiryDate");
      expect(expiry!.value).toBe("200101");
    });
  });

  describe("Tesseract fallback integration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("falls back to Tesseract when PaddleOCR confidence is below threshold", async () => {
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

      const tesseractEngine = {
        isAvailable: vi.fn().mockResolvedValue(true),
        extractText: vi.fn().mockResolvedValue(makeTd3MrzLines()),
      } as unknown as TesseractOcrEngine;

      const engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });

      expect(tesseractEngine.extractText).toHaveBeenCalledWith({
        imagePath: "/tmp/test.jpg",
      });
      expect(result.averageConfidence).toBeCloseTo(0.94, 2);
    });

    it("does not trigger fallback when PaddleOCR confidence is sufficient", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<",
            chunks: [{ text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.92 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const tesseractEngine = {
        isAvailable: vi.fn().mockResolvedValue(true),
        extractText: vi.fn(),
      } as unknown as TesseractOcrEngine;

      const engine = new PaddleOcrEngine(tesseractEngine);
      await engine.extractText({ imagePath: "/tmp/test.jpg" });

      expect(tesseractEngine.extractText).not.toHaveBeenCalled();
    });

    it("falls back when PaddleOCR throws an error", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        throw new Error("PaddleOCR IPC failed");
      });

      const tesseractEngine = {
        isAvailable: vi.fn().mockResolvedValue(true),
        extractText: vi.fn().mockResolvedValue(makeTd3MrzLines()),
      } as unknown as TesseractOcrEngine;

      const engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });

      expect(tesseractEngine.extractText).toHaveBeenCalled();
      expect(result.averageConfidence).toBeCloseTo(0.94, 2);
    });

    it("keeps PaddleOCR result when Tesseract fallback has lower confidence", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "moderate quality MRZ text",
            chunks: [{ text: "moderate quality MRZ text", confidence: 0.55 }],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const tesseractEngine = {
        isAvailable: vi.fn().mockResolvedValue(true),
        extractText: vi.fn().mockResolvedValue({
          lines: [{ text: "LOW QUALITY OCR", confidence: 0.3 }],
          fullText: "LOW QUALITY OCR",
          averageConfidence: 0.3,
        }),
      } as unknown as TesseractOcrEngine;

      const engine = new PaddleOcrEngine(tesseractEngine);
      const result = await engine.extractText({ imagePath: "/tmp/test.jpg" });

      expect(result.averageConfidence).toBeCloseTo(0.55, 2);
    });

    it("throws when both engines are unavailable", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return false;
        throw new Error("unavailable");
      });

      const engine = new PaddleOcrEngine();
      await expect(engine.extractText({ imagePath: "/tmp/test.jpg" })).rejects.toThrow(
        "PaddleOCR engine is not available",
      );
    });

    it("reports usedFallback=false when PaddleOCR succeeds directly", async () => {
      const { invoke } = await import("@tauri-apps/api/tauri");
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        if (cmd === "check_paddleocr_available") return true;
        if (cmd === "extract_paddleocr_mrz") {
          return {
            text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
            chunks: [
              { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
              { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
            ],
          };
        }
        throw new Error(`Unknown command: ${cmd}`);
      });

      const engine = new PaddleOcrEngine();
      const result = (await engine.extractTextWithFields({
        imagePath: "/tmp/test.jpg",
      })) as OcrFieldResults;

      expect(result.usedFallback).toBe(false);
    });
  });

  describe("cross-module: OCR -> MRZ Parser -> Checksum Validator -> Normalization", () => {
    it("parses TD3 MockOcrEngine result through full MRZ pipeline", async () => {
      const engine = new MockOcrEngine({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
          { text: "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
        averageConfidence: 0.94,
      });

      const ocrResult = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      const mrzLines = ocrResult.lines.map((l) => l.text);

      const parser = createMrzParserService();
      const parseResult = parser.parseMrzLines(mrzLines);

      expect(parseResult.documentType).toBe("PASSPORT");
      expect(parseResult.issuingCountry).toBe("UTO");
      expect(parseResult.surname).toBe("MUSTER");
      expect(parseResult.givenName).toBe("JOHN MICHAEL");
      expect(parseResult.passportNumber).toBe("AB123456");
      expect(parseResult.dateOfBirth).toBe("1985-10-10");
      expect(parseResult.expiryDate).toBe("2020-01-01");
      expect(parseResult.gender).toBe("M");

      const validator = createMrzChecksumValidator();
      const checksumResult = validator.validateChecksums(mrzLines);

      expect(checksumResult.overallValid).toBe(true);
      expect(checksumResult.passportNumberValid).toBe(true);
      expect(checksumResult.dateOfBirthValid).toBe(true);
      expect(checksumResult.expiryDateValid).toBe(true);
      expect(checksumResult.errors).toHaveLength(0);

      const mrzParsedFields = {
        fullName: parseResult.fullName,
        surname: parseResult.surname,
        givenName: parseResult.givenName,
        gender: parseResult.gender,
        dateOfBirth: parseResult.dateOfBirth,
        nationality: parseResult.nationality,
        issuingCountry: parseResult.issuingCountry,
        documentType: parseResult.documentType,
        passportNumber: parseResult.passportNumber,
        documentNumber: parseResult.passportNumber,
        idNumber: parseResult.optionalData,
        issueDate: "",
        expiryDate: parseResult.expiryDate,
        mrzRaw: ocrResult.fullText,
        mrzParsed: mrzLines,
        checkDigits: {
          passport_number_valid: checksumResult.passportNumberValid,
          date_of_birth_valid: checksumResult.dateOfBirthValid,
          expiry_date_valid: checksumResult.expiryDateValid,
          optional_data_valid: checksumResult.optionalDataValid,
          final_composite_valid: checksumResult.finalCompositeValid,
          overall_valid: checksumResult.overallValid,
          ...parseResult.checkDigits,
        },
      };

      const normalizer = createFieldNormalizationService();
      const normalized = normalizer.normalizeFields(mrzParsedFields);

      expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
      expect(normalized.firstName).toBe("JOHN MICHAEL");
      expect(normalized.lastName).toBe("MUSTER");
      expect(normalized.documentType).toBe("PASSPORT");
      expect(normalized.nationality).toBe("UTO");
      expect(normalized.countryCode).toBe("UTO");
      expect(normalized.dateOfBirth).toBe("1985-10-10");
      expect(normalized.expiryDate).toBe("2020-01-01");
      expect(normalized.gender).toBe("M");
      expect(normalized.passportNumber).toBe("AB123456");
    });

    it("parses TD1 MockOcrEngine result through pipeline", async () => {
      const engine = new MockOcrEngine(makeTd1MrzLines());
      const ocrResult = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      const mrzLines = ocrResult.lines.map((l) => l.text);

      const parser = createMrzParserService();
      const parseResult = parser.parseMrzLines(mrzLines);

      expect(parseResult.documentType).toBe("ID_CARD");
      expect(parseResult.surname).toBe("MUSTER");
      expect(parseResult.givenName).toBe("JOHN MICHAEL");

      const validator = createMrzChecksumValidator();
      const checksumResult = validator.validateChecksums(mrzLines);
      expect(checksumResult.overallValid).toBe(true);
    });

    it("computes confidence scores after normalization", async () => {
      const engine = new MockOcrEngine(makeTd3MrzLines());
      const ocrResult = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      const mrzLines = ocrResult.lines.map((l) => l.text);

      const parser = createMrzParserService();
      const parseResult = parser.parseMrzLines(mrzLines);

      const validator = createMrzChecksumValidator();
      const checksumResult = validator.validateChecksums(mrzLines);

      const mrzParsedFields = {
        fullName: parseResult.fullName,
        surname: parseResult.surname,
        givenName: parseResult.givenName,
        gender: parseResult.gender,
        dateOfBirth: parseResult.dateOfBirth,
        nationality: parseResult.nationality,
        issuingCountry: parseResult.issuingCountry,
        documentType: parseResult.documentType,
        passportNumber: parseResult.passportNumber,
        documentNumber: parseResult.passportNumber,
        idNumber: parseResult.optionalData,
        issueDate: "",
        expiryDate: parseResult.expiryDate,
        mrzRaw: ocrResult.fullText,
        mrzParsed: mrzLines,
        checkDigits: {
          passport_number_valid: checksumResult.passportNumberValid,
          date_of_birth_valid: checksumResult.dateOfBirthValid,
          expiry_date_valid: checksumResult.expiryDateValid,
          optional_data_valid: checksumResult.optionalDataValid,
          final_composite_valid: checksumResult.finalCompositeValid,
          overall_valid: checksumResult.overallValid,
          ...parseResult.checkDigits,
        },
      };

      const normalizer = createFieldNormalizationService();
      const normalized = normalizer.normalizeFields(mrzParsedFields);

      const confidenceService = createOcrConfidenceService();
      const scores = confidenceService.calculateConfidence(normalized, ocrResult, parseResult.checkDigits);

      expect(scores.passportNumber.score).toBeGreaterThan(0);
      expect(scores.fullName.score).toBeGreaterThan(0);
      expect(scores.dateOfBirth.score).toBeGreaterThan(0);
    });
  });

  describe("edge cases and error handling across modules", () => {
    it("handles engine failure gracefully in pipeline context", async () => {
      const failingEngine = new MockOcrEngine({ failWithError: true });

      await expect(failingEngine.extractText({ imagePath: "/tmp/test.jpg" })).rejects.toThrow(
        "Mock OCR engine simulated failure",
      );
    });

    it("propagates MRZ_NOT_FOUND from parser through normalization", () => {
      const parser = createMrzParserService();
      const result = parser.parseMrzLines(["NON_MRZ_TEXT"]);

      expect(result.passportNumber).toBe("");
      expect(result.surname).toBe("");
      expect(result.fullName).toBe("");

      const validator = createMrzChecksumValidator();
      const checksumResult = validator.validateChecksums(["NON_MRZ_TEXT"]);

      expect(checksumResult.overallValid).toBe(false);
      expect(checksumResult.errors.length).toBeGreaterThan(0);
    });

    it("handles invalid checksums through full pipeline", async () => {
      const engine = new MockOcrEngine({
        lines: [
          { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
          { text: "AB123456<0UTO8510105M2001012<<<<<<<<<<<<<<<<0<<", confidence: 0.93 },
        ],
        fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<0UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
        averageConfidence: 0.94,
      });

      const ocrResult = await engine.extractText({ imagePath: "/tmp/test.jpg" });
      const mrzLines = ocrResult.lines.map((l) => l.text);

      const validator = createMrzChecksumValidator();
      const checksumResult = validator.validateChecksums(mrzLines);

      expect(checksumResult.passportNumberValid).toBe(false);
      expect(checksumResult.overallValid).toBe(false);
    });

    it("handles single-line input gracefully", () => {
      const parser = createMrzParserService();
      const result = parser.parseMrzLines(["SINGLE_LINE_NOT_MRZ"]);
      expect(result.fullName).toBe("");
      expect(result.passportNumber).toBe("");
    });
  });
});
