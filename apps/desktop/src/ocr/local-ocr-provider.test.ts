import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalOCRProvider } from "./local-ocr-provider";

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(),
  PSM: { AUTO: 3 },
}));

vi.mock("../lib/isTauri", () => ({
  isTauri: () => false,
}));

vi.mock("../lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("LocalOCRProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should implement OcrProvider interface", () => {
    const provider = new LocalOCRProvider();
    expect(provider.name).toBe("LocalOCR");
    expect(provider.type).toBe("LOCAL");
    expect(typeof provider.processImage).toBe("function");
    expect(typeof provider.cancel).toBe("function");
    expect(typeof provider.isAvailable).toBe("function");
  });

  it("should start as unavailable", () => {
    const provider = new LocalOCRProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it("should cancel without error", () => {
    const provider = new LocalOCRProvider();
    expect(() => provider.cancel()).not.toThrow();
  });

  it("should return ready state after init", async () => {
    const mockWorker = {
      recognize: vi.fn(),
      setParameters: vi.fn(),
      terminate: vi.fn(),
    };
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockResolvedValue(mockWorker as never);

    const provider = new LocalOCRProvider();
    const worker = await (provider as unknown as { getWorker(): Promise<unknown> }).getWorker?.();

    expect(worker).toBeDefined();
  });

  it("should be destroyable after init", async () => {
    const mockWorker = {
      recognize: vi.fn(),
      setParameters: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockResolvedValue(mockWorker as never);

    const provider = new LocalOCRProvider();

    await expect(provider.processImage("test.jpg")).rejects.toThrow();

    await provider.destroy();
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it("should destroy safely without init", async () => {
    const provider = new LocalOCRProvider();
    await expect(provider.destroy()).resolves.toBeUndefined();
  });

  it("should process image with MRZ and extract fields", async () => {
    const mockWorker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text:
            "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\n" + "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
          confidence: 95,
          lines: [],
          words: [],
        },
      }),
      setParameters: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockResolvedValue(mockWorker as never);

    const provider = new LocalOCRProvider();
    const result = await provider.processImage("test.jpg");

    expect(result).toBeDefined();
    expect(result.provider).toBe("LOCAL");
    expect(result.fields.fullName?.value).toBe("MUSTER JOHN MICHAEL");
    expect(result.fields.lastName?.value).toBe("MUSTER");
    expect(result.fields.firstName?.value).toBe("JOHN MICHAEL");
    expect(result.fields.passportNumber?.value).toBe("AB123456");
    expect(result.fields.nationality?.value).toBe("UTO");
    expect(result.fields.dateOfBirth?.value).toBe("1985-10-10");
    expect(result.fields.gender?.value).toBe("M");
    expect(result.fields.expiryDate?.value).toBe("2020-01-01");
    expect(result.detectedDocumentType).toBe("PASSPORT");
    expect(result.detectedGender).toBe("M");
    expect(result.isExpired).toBe(true);
    expect(result.warnings).toContain("DOCUMENT_EXPIRED");
    expect(result.fields.mrzCode).toBeDefined();
    expect(result.rawText).toContain("P<UTO");
  });

  it("should process image with visual OCR and extract fields", async () => {
    const mockWorker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text:
            "Passport No. AB123456\n" +
            "Surname: MUSTER\n" +
            "Given Name: JOHN MICHAEL\n" +
            "Nationality: VNM\n" +
            "Date of Birth: 15/01/1985\n" +
            "Sex: M\n" +
            "Date of Expiry: 01/01/2030\n" +
            "Place of Birth: HANOI\n",
          confidence: 72,
          lines: [],
          words: [],
        },
      }),
      setParameters: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockResolvedValue(mockWorker as never);

    const provider = new LocalOCRProvider();
    const result = await provider.processImage("test.jpg");

    expect(result).toBeDefined();
    expect(result.provider).toBe("LOCAL");
    expect(result.fields.fullName?.value).toBe("MUSTER JOHN MICHAEL");
    expect(result.fields.lastName?.value).toBe("MUSTER");
    expect(result.fields.firstName?.value).toBe("JOHN MICHAEL");
    expect(result.fields.passportNumber?.value).toBe("AB123456");
    expect(result.fields.nationality?.value).toBe("VNM");
    expect(result.fields.dateOfBirth?.value).toBe("1985-01-15");
    expect(result.fields.gender?.value).toBe("M");
    expect(result.fields.expiryDate?.value).toBe("2030-01-01");
    expect(result.warnings).toContain("MRZ_NOT_FOUND");
  });

  it("should detect warnings for low confidence and missing fields", async () => {
    const mockWorker = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: "Some blurry text\nthat is not readable\nno clear fields",
          confidence: 25,
          lines: [],
          words: [],
        },
      }),
      setParameters: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockResolvedValue(mockWorker as never);

    const provider = new LocalOCRProvider();
    const result = await provider.processImage("test.jpg");

    expect(result.warnings).toContain("MRZ_NOT_FOUND");
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(result.warnings).toContain("MISSING_REQUIRED_FIELD");
    expect(result.overallConfidenceLevel).toBe("LOW");
    expect(result.overallConfidence).toBeLessThan(0.5);
  });

  it("should handle abort signal", async () => {
    const abortController = new AbortController();
    const provider = new LocalOCRProvider();

    abortController.abort();

    await expect(provider.processImage("test.jpg", abortController.signal)).rejects.toThrow("OCR was canceled");
  });

  it("should handle worker initialization failure", async () => {
    const { createWorker } = await import("tesseract.js");
    vi.mocked(createWorker).mockRejectedValue(new Error("Failed to create worker"));

    const provider = new LocalOCRProvider();

    await expect(provider.processImage("test.jpg")).rejects.toThrow("Failed to create worker");
    expect(provider.isAvailable()).toBe(false);
  });
});
