import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureOCRProvider } from "./azure-ocr-provider";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../lib/isTauri", () => ({
  isTauri: () => true,
}));

vi.mock("@guestfill/shared", () => ({
  maskPassportNumber: (v: string) => v.slice(0, 4) + "*".repeat(Math.max(0, v.length - 4)),
  maskFullName: (v: string) => v,
}));

vi.mock("../lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createPassportResponse(): Record<string, unknown> {
  return {
    docType: "idDocument.passport",
    fields: {
      FirstName: { value: "JOHN MICHAEL", confidence: 0.99 },
      LastName: { value: "MUSTER", confidence: 0.98 },
      DateOfBirth: { value: "1985-10-10", confidence: 0.99 },
      Sex: { value: "M", confidence: 0.99 },
      Nationality: { value: "UTO", confidence: 0.98 },
      DocumentNumber: { value: "AB123456", confidence: 0.99 },
      DateOfExpiry: { value: "2020-01-01", confidence: 0.99 },
      DateOfIssue: { value: "2015-01-01", confidence: 0.97 },
      CountryOfIssue: { value: "UTO", confidence: 0.98 },
    },
    content: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    overallConfidence: 0.98,
  };
}

function createIdCardResponse(): Record<string, unknown> {
  return {
    docType: "idDocument.idCard",
    fields: {
      FirstName: { value: "JOHN", confidence: 0.95 },
      LastName: { value: "DOE", confidence: 0.94 },
      DateOfBirth: { value: "15/01/1990", confidence: 0.93 },
      Sex: { value: "M", confidence: 0.96 },
      Nationality: { value: "USA", confidence: 0.95 },
      IdNumber: { value: "ID12345678", confidence: 0.97 },
      DateOfExpiry: { value: "2030-01-01", confidence: 0.94 },
      DateOfIssue: { value: "2020-01-01", confidence: 0.92 },
      CountryOfIssue: { value: "USA", confidence: 0.95 },
      Address: { value: "123 MAIN STREET", confidence: 0.88 },
    },
    content: "ID CARD\nDOE JOHN\nUSA\nID12345678\n01/01/2030",
    overallConfidence: 0.94,
  };
}

describe("AzureOCRProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
  });

  it("should implement OcrProvider interface", () => {
    const provider = new AzureOCRProvider();
    expect(provider.name).toBe("AzureOCR");
    expect(provider.type).toBe("AZURE");
    expect(typeof provider.processImage).toBe("function");
    expect(typeof provider.cancel).toBe("function");
    expect(typeof provider.isAvailable).toBe("function");
  });

  it("should start as unavailable", () => {
    const provider = new AzureOCRProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it("should cancel without error", () => {
    const provider = new AzureOCRProvider();
    expect(() => provider.cancel()).not.toThrow();
  });

  it("should check availability via Tauri command", async () => {
    mockInvoke.mockResolvedValue(true);

    const provider = new AzureOCRProvider();
    const available = await provider["checkAvailability"]();

    expect(available).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("check_azure_available");
  });

  it("should report unavailable when Tauri command fails", async () => {
    mockInvoke.mockRejectedValue(new Error("Not configured"));

    const provider = new AzureOCRProvider();
    const available = await provider["checkAvailability"]();

    expect(available).toBe(false);
  });

  it("should process passport image and extract fields", async () => {
    mockInvoke.mockResolvedValue(createPassportResponse());

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("passport.jpg");

    expect(result).toBeDefined();
    expect(result.provider).toBe("AZURE");
    expect(result.overallConfidence).toBeCloseTo(0.98);
    expect(result.overallConfidenceLevel).toBe("HIGH");
    expect(result.fields.fullName?.value).toBe("MUSTER JOHN MICHAEL");
    expect(result.fields.lastName?.value).toBe("MUSTER");
    expect(result.fields.firstName?.value).toBe("JOHN MICHAEL");
    expect(result.fields.passportNumber?.value).toBe("AB123456");
    expect(result.fields.nationality?.value).toBe("UTO");
    expect(result.fields.dateOfBirth?.value).toBe("1985-10-10");
    expect(result.fields.gender?.value).toBe("M");
    expect(result.fields.expiryDate?.value).toBe("2020-01-01");
    expect(result.fields.issueDate?.value).toBe("2015-01-01");
    expect(result.fields.issuingCountry?.value).toBe("UTO");
    expect(result.detectedDocumentType).toBe("PASSPORT");
    expect(result.detectedGender).toBe("M");
    expect(result.isExpired).toBe(true);
    expect(result.warnings).toContain("DOCUMENT_EXPIRED");
    expect(result.rawText).toContain("P<UTO");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(mockInvoke).toHaveBeenCalledWith("extract_azure_document", {
      imagePath: "passport.jpg",
    });
  });

  it("should process ID card image and extract fields", async () => {
    mockInvoke.mockResolvedValue(createIdCardResponse());

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("id_card.jpg");

    expect(result).toBeDefined();
    expect(result.provider).toBe("AZURE");
    expect(result.fields.fullName?.value).toBe("DOE JOHN");
    expect(result.fields.lastName?.value).toBe("DOE");
    expect(result.fields.firstName?.value).toBe("JOHN");
    expect(result.fields.idNumber?.value).toBe("ID12345678");
    expect(result.fields.nationality?.value).toBe("USA");
    expect(result.fields.dateOfBirth?.value).toBe("1990-01-15");
    expect(result.fields.gender?.value).toBe("M");
    expect(result.fields.expiryDate?.value).toBe("2030-01-01");
    expect(result.fields.issueDate?.value).toBe("2020-01-01");
    expect(result.fields.issuingCountry?.value).toBe("USA");
    expect(result.fields.address?.value).toBe("123 MAIN STREET");
    expect(result.detectedDocumentType).toBe("ID_CARD");
    expect(result.warnings).not.toContain("DOCUMENT_EXPIRED");
    expect(result.warnings).not.toContain("MISSING_REQUIRED_FIELD");
  });

  it("should detect warnings for low confidence and missing fields", async () => {
    mockInvoke.mockResolvedValue({
      docType: "idDocument.passport",
      fields: {
        FirstName: { value: "JOHN", confidence: 0.3 },
        LastName: { value: "DOE", confidence: 0.7 },
        DateOfBirth: { value: "1990-01-01", confidence: 0.25 },
      },
      overallConfidence: 0.35,
    });

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("bad.jpg");

    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(result.warnings).toContain("MISSING_REQUIRED_FIELD");
    expect(result.overallConfidenceLevel).toBe("LOW");
    expect(result.overallConfidence).toBeLessThan(0.5);
  });

  it("should detect document expiring soon warning", async () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    const expiryStr = futureDate.toISOString().slice(0, 10);

    mockInvoke.mockResolvedValue({
      docType: "idDocument.passport",
      fields: {
        FirstName: { value: "JOHN", confidence: 0.99 },
        LastName: { value: "DOE", confidence: 0.99 },
        DateOfBirth: { value: "1990-01-01", confidence: 0.99 },
        Nationality: { value: "USA", confidence: 0.99 },
        DocumentNumber: { value: "AB123456", confidence: 0.99 },
        DateOfExpiry: { value: expiryStr, confidence: 0.99 },
      },
      overallConfidence: 0.95,
    });

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("expiring.jpg");

    expect(result.warnings).toContain("DOCUMENT_EXPIRING_SOON");
    expect(result.warnings).not.toContain("DOCUMENT_EXPIRED");
  });

  it("should handle abort signal before processing", async () => {
    const abortController = new AbortController();
    const provider = new AzureOCRProvider();

    abortController.abort();

    await expect(provider.processImage("test.jpg", abortController.signal)).rejects.toThrow("OCR was canceled");
  });

  it("should handle backend unavailable error", async () => {
    mockInvoke.mockRejectedValue(new Error("Azure Document Intelligence not configured"));

    const provider = new AzureOCRProvider();

    await expect(provider.processImage("test.jpg")).rejects.toThrow("AzureOCR provider is not available");
  });

  it("should handle Tauri invoke failure", async () => {
    mockInvoke.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const provider = new AzureOCRProvider();
    await provider.initialize();

    await expect(provider.processImage("test.jpg")).rejects.toThrow("API rate limit exceeded");
  });

  it("should handle network error during extraction", async () => {
    mockInvoke.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("Network error"));

    const provider = new AzureOCRProvider();
    await provider.initialize();

    await expect(provider.processImage("test.jpg")).rejects.toThrow("Network error");
  });

  it("should handle empty fields gracefully", async () => {
    mockInvoke.mockResolvedValue({
      docType: "idDocument.unknown",
      fields: {},
      overallConfidence: 0,
    });

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("empty.jpg");

    expect(result.fields).toEqual({});
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(result.warnings).toContain("MISSING_REQUIRED_FIELD");
  });

  it("should map document type from Azure docType correctly", async () => {
    mockInvoke.mockResolvedValue({
      docType: "idDocument.passport",
      fields: {
        FirstName: { value: "JOHN", confidence: 0.99 },
        LastName: { value: "DOE", confidence: 0.99 },
        DateOfBirth: { value: "1990-01-01", confidence: 0.99 },
        Nationality: { value: "USA", confidence: 0.99 },
        DocumentNumber: { value: "AB123456", confidence: 0.99 },
        DateOfExpiry: { value: "2030-01-01", confidence: 0.99 },
      },
      overallConfidence: 0.95,
    });

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("doc.jpg");

    expect(result.detectedDocumentType).toBe("PASSPORT");
    expect(result.fields.documentType?.value).toBe("PASSPORT");
  });

  it("should normalize nationality to 3-letter code", async () => {
    mockInvoke.mockResolvedValue({
      docType: "idDocument.passport",
      fields: {
        FirstName: { value: "JOHN", confidence: 0.99 },
        LastName: { value: "DOE", confidence: 0.99 },
        DateOfBirth: { value: "1990-01-01", confidence: 0.99 },
        Nationality: { value: "Vietnam", confidence: 0.95 },
        DocumentNumber: { value: "AB123456", confidence: 0.99 },
        DateOfExpiry: { value: "2030-01-01", confidence: 0.99 },
      },
      overallConfidence: 0.95,
    });

    const provider = new AzureOCRProvider();
    await provider.initialize();
    const result = await provider.processImage("nationality.jpg");

    expect(result.fields.nationality?.value).toBe("VIE");
  });

  it("should be available after initialize", async () => {
    mockInvoke.mockResolvedValue(true);

    const provider = new AzureOCRProvider();
    await provider.initialize();

    expect(provider.isAvailable()).toBe(true);
  });
});
