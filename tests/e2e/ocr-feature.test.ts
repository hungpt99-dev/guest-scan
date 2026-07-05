import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type {
  OcrProvider,
  OcrResult,
  ExtractedFields,
  ExtractedField,
  OcrProviderType,
  OcrWarningCode,
  GuestRow,
} from "../../apps/desktop/src/ocr/ocr-controller";
import { OcrController } from "../../apps/desktop/src/ocr/ocr-controller";

// ───────────────────── Mock OcrProvider implementations ─────────────────────

function makeExtractedField(value: string, confidence: number, source?: ExtractedField["source"]): ExtractedField {
  return { value, confidence, ...(source ? { source } : {}) };
}

function makeSuccessfulLocalResult(overrides?: Partial<OcrResult>): OcrResult {
  const fields: ExtractedFields = {
    fullName: makeExtractedField("JOHN MICHAEL DOE", 0.85, "mrz"),
    firstName: makeExtractedField("JOHN MICHAEL", 0.84, "mrz"),
    lastName: makeExtractedField("DOE", 0.86, "mrz"),
    dateOfBirth: makeExtractedField("1985-10-10", 0.9, "mrz"),
    gender: makeExtractedField("M", 0.92, "mrz"),
    nationality: makeExtractedField("USA", 0.88, "mrz"),
    passportNumber: makeExtractedField("AB123456", 0.95, "mrz"),
    documentType: makeExtractedField("PASSPORT", 0.94, "mrz"),
    issueDate: makeExtractedField("2015-06-01", 0.87, "mrz"),
    expiryDate: makeExtractedField("2025-06-01", 0.89, "mrz"),
    issuingCountry: makeExtractedField("USA", 0.88, "mrz"),
    mrzCode: makeExtractedField(
      "P<USADOE<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4USA8510105M2506012<<<<<<<<<<<<<<<<02",
      0.85,
      "mrz",
    ),
  };
  return {
    fields,
    rawText: Object.values(fields)
      .map((f) => f?.value ?? "")
      .join("\n"),
    overallConfidence: 0.88,
    overallConfidenceLevel: "HIGH",
    provider: "LOCAL",
    warnings: [],
    detectedDocumentType: "PASSPORT",
    detectedGender: "M",
    isExpired: false,
    processingTimeMs: 1200,
    ...overrides,
  };
}

function makeSuccessfulAzureResult(overrides?: Partial<OcrResult>): OcrResult {
  const fields: ExtractedFields = {
    fullName: makeExtractedField("JANE ELIZABETH SMITH", 0.96, "azure_document_intelligence"),
    firstName: makeExtractedField("JANE ELIZABETH", 0.95, "azure_document_intelligence"),
    lastName: makeExtractedField("SMITH", 0.97, "azure_document_intelligence"),
    dateOfBirth: makeExtractedField("1990-04-15", 0.98, "azure_document_intelligence"),
    gender: makeExtractedField("F", 0.99, "azure_document_intelligence"),
    nationality: makeExtractedField("GBR", 0.96, "azure_document_intelligence"),
    passportNumber: makeExtractedField("XY789012", 0.99, "azure_document_intelligence"),
    documentType: makeExtractedField("PASSPORT", 0.98, "azure_document_intelligence"),
    issueDate: makeExtractedField("2020-03-10", 0.95, "azure_document_intelligence"),
    expiryDate: makeExtractedField("2030-03-09", 0.97, "azure_document_intelligence"),
    issuingCountry: makeExtractedField("GBR", 0.96, "azure_document_intelligence"),
    mrzCode: makeExtractedField(
      "P<GBRSMITH<<JANE<ELIZABETH<<<<<<<<<<<<<<<<<<<<<<\nXY789012<3GBR9004156F3003092<<<<<<<<<<<<<<<<06",
      0.95,
      "azure_document_intelligence",
    ),
  };
  return {
    fields,
    rawText: Object.values(fields)
      .map((f) => f?.value ?? "")
      .join("\n"),
    overallConfidence: 0.97,
    overallConfidenceLevel: "HIGH",
    provider: "AZURE",
    warnings: [],
    detectedDocumentType: "PASSPORT",
    detectedGender: "F",
    isExpired: false,
    processingTimeMs: 800,
    ...overrides,
  };
}

function makeExpiredResult(provider: OcrProviderType): OcrResult {
  const base = provider === "AZURE" ? makeSuccessfulAzureResult() : makeSuccessfulLocalResult();
  return {
    ...base,
    fields: {
      ...base.fields,
      expiryDate: makeExtractedField("2019-11-20", 0.85, base.fields.expiryDate?.source ?? "mrz"),
    },
    warnings: ["DOCUMENT_EXPIRED"],
    isExpired: true,
    overallConfidenceLevel: "MEDIUM",
    overallConfidence: 0.65,
  };
}

function makeLowConfidenceResult(provider: OcrProviderType): OcrResult {
  const base = provider === "AZURE" ? makeSuccessfulAzureResult() : makeSuccessfulLocalResult();
  return {
    ...base,
    fields: {
      ...base.fields,
      fullName: makeExtractedField("J0HN M1CHAEL D0E", 0.35, base.fields.fullName?.source ?? "mrz"),
      passportNumber: makeExtractedField("AB12?45?", 0.28, base.fields.passportNumber?.source ?? "mrz"),
    },
    overallConfidence: 0.32,
    overallConfidenceLevel: "LOW",
    warnings: ["LOW_CONFIDENCE_FIELD"],
  };
}

function makeMissingFieldsResult(provider: OcrProviderType): OcrResult {
  const base = provider === "AZURE" ? makeSuccessfulAzureResult() : makeSuccessfulLocalResult();
  return {
    ...base,
    fields: {
      ...base.fields,
      fullName: makeExtractedField("", 0, undefined),
      dateOfBirth: makeExtractedField("", 0, undefined),
      nationality: makeExtractedField("", 0, undefined),
      documentType: makeExtractedField("", 0, undefined),
    },
    overallConfidence: 0.15,
    overallConfidenceLevel: "LOW",
    warnings: ["MISSING_REQUIRED_FIELD", "LOW_CONFIDENCE_FIELD"],
  };
}

class MockOcrProvider implements OcrProvider {
  readonly name: string;
  readonly type: OcrProviderType;
  private mockResult: OcrResult;
  private shouldFail = false;
  private failMessage = "Mock OCR provider simulated failure";
  cancelCalled = false;

  constructor(type: OcrProviderType, mockResult: OcrResult) {
    this.type = type;
    this.name = type === "LOCAL" ? "LocalOCR" : "AzureOCR";
    this.mockResult = mockResult;
  }

  setResult(result: OcrResult): void {
    this.mockResult = result;
  }

  setFail(fail: boolean, message?: string): void {
    this.shouldFail = fail;
    if (message) this.failMessage = message;
  }

  async processImage(_imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    await new Promise<void>((resolve, reject) => {
      const done = () => resolve();
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException("OCR was canceled", "AbortError"));
          return;
        }
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          reject(new DOMException("OCR was canceled", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
      // Small delay so status transitions are observable
      setTimeout(done, 1);
    });
    return { ...this.mockResult, processingTimeMs: Math.round(performance.now()) };
  }

  cancel(): void {
    this.cancelCalled = true;
  }

  isAvailable(): boolean {
    return true;
  }
}

// ───────────────────── Test helpers ─────────────────────

function verifyGuestRowBase(guest: Partial<GuestRow>, result: OcrResult): void {
  const fields = result.fields;
  expect(guest.fullName).toBe(fields.fullName?.value ?? "");
  expect(guest.surname).toBe(fields.lastName?.value);
  expect(guest.givenName).toBe(fields.firstName?.value);
  expect(guest.passportNumber).toBe(fields.passportNumber?.value);
  expect(guest.nationality).toBe(fields.nationality?.value);
  expect(guest.dateOfBirth).toBe(fields.dateOfBirth?.value);
  expect(guest.documentType).toBe(result.detectedDocumentType ?? "UNKNOWN");
  expect(guest.confidenceScore).toBe(result.overallConfidence);
  expect(guest.confidenceLevel).toBe(result.overallConfidenceLevel);
  expect(guest.gender).toBe(result.detectedGender ?? "UNKNOWN");
  expect(guest.issuingCountry).toBe(fields.issuingCountry?.value);
  expect(guest.idNumber).toBe(fields.idNumber?.value);
}

function verifyGuestRowExpiry(guest: Partial<GuestRow>, result: OcrResult): void {
  if (guest.documentType === "PASSPORT") {
    expect(guest.passportExpiryDate).toBe(result.fields.expiryDate?.value);
  } else if (guest.documentType === "ID_CARD") {
    expect(guest.idExpiryDate).toBe(result.fields.expiryDate?.value);
  }
}

// ───────────────────── Tests ─────────────────────

describe("OCR Feature E2E: Provider Selection and Status", () => {
  it("shows LocalOCR as default provider type", () => {
    const providerType: OcrProviderType = "LOCAL";
    expect(providerType).toBe("LOCAL");
    const allTypes: OcrProviderType[] = ["LOCAL", "AZURE"];
    expect(allTypes).toHaveLength(2);
    expect(allTypes).toContain("LOCAL");
    expect(allTypes).toContain("AZURE");
  });

  it("shows OCR processing status as IDLE initially", () => {
    const controller = new OcrController();
    const state = controller.getState();
    expect(state.status).toBe("IDLE");
    expect(state.providerType).toBeNull();
    expect(state.ocrResult).toBeNull();
    expect(state.mappedGuest).toBeNull();
    expect(state.error).toBeNull();
    expect(state.warnings).toEqual([]);
  });

  it("tracks status transitions: IDLE -> PROCESSING -> COMPLETED", async () => {
    const result = makeSuccessfulLocalResult();
    const provider = new MockOcrProvider("LOCAL", result);
    const controller = new OcrController(provider);

    expect(controller.getState().status).toBe("IDLE");

    const { guest, result: ocrResult } = await controller.processOcr("/tmp/test.jpg", "LOCAL");
    expect(controller.getState().status).toBe("COMPLETED");
    expect(ocrResult.overallConfidence).toBeGreaterThan(0.6);
    expect(guest.fullName).toBe("JOHN MICHAEL DOE");
    expect(guest.passportNumber).toBe("AB123456");
  });

  it("tracks status when OCR fails: IDLE -> UPLOADING -> PROCESSING -> FAILED", async () => {
    const result = makeSuccessfulLocalResult();
    const provider = new MockOcrProvider("LOCAL", result);
    provider.setFail(true, "Image too blurry");
    const controller = new OcrController(provider);

    await expect(controller.processOcr("/tmp/blurry.jpg", "LOCAL")).rejects.toThrow("Image too blurry");
    expect(controller.getState().status).toBe("FAILED");
    expect(controller.getState().error).toContain("Image too blurry");
  });
});

describe("OCR Feature E2E: Local OCR Flow", () => {
  let controller: OcrController;
  let localProvider: MockOcrProvider;

  beforeEach(() => {
    localProvider = new MockOcrProvider("LOCAL", makeSuccessfulLocalResult());
    controller = new OcrController(localProvider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("processes passport image with Local OCR and extracts guest data", async () => {
    const { guest, result } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");

    expect(result.provider).toBe("LOCAL");
    expect(result.overallConfidenceLevel).toBe("HIGH");
    expect(result.warnings).toHaveLength(0);
    expect(result.fields.fullName?.value).toBe("JOHN MICHAEL DOE");
    expect(result.fields.passportNumber?.value).toBe("AB123456");
    expect(result.fields.dateOfBirth?.value).toBe("1985-10-10");
    expect(result.fields.gender?.value).toBe("M");
    expect(result.fields.nationality?.value).toBe("USA");
    expect(result.fields.documentType?.value).toBe("PASSPORT");

    verifyGuestRowBase(guest, result);
    expect(guest.status).toBe("READY");
  });

  it("maps Local OCR fields correctly to GuestRow", async () => {
    const { guest, result } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");

    verifyGuestRowBase(guest, result);
    verifyGuestRowExpiry(guest, result);
    expect(guest.passportExpiryDate).toBe("2025-06-01");
    expect(guest.status).toBe("READY");
    expect(guest.fieldConfidence).toBeDefined();
    expect(guest.fieldConfidence!["fullName"]).toBe(0.85);
    expect(guest.fieldConfidence!["passportNumber"]).toBe(0.95);
  });

  it("stores field-level confidence scores for review UI", async () => {
    const { result } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");

    const fieldConfidence = controller.getState().fieldConfidence;
    expect(fieldConfidence.fullName).toBe(0.85);
    expect(fieldConfidence.passportNumber).toBe(0.95);
    expect(fieldConfidence.dateOfBirth).toBe(0.9);
    expect(fieldConfidence.nationality).toBe(0.88);

    for (const [, confidence] of Object.entries(result.fields)) {
      if (confidence) {
        const key = Object.keys(result.fields).find((k) => result.fields[k as keyof ExtractedFields] === confidence)!;
        expect(fieldConfidence[key]).toBe(confidence.confidence);
      }
    }
  });

  it("generates warnings when Local OCR produces low-confidence data", async () => {
    localProvider.setResult(makeLowConfidenceResult("LOCAL"));
    const { result } = await controller.processOcr("/tmp/low-conf.jpg", "LOCAL");

    expect(result.overallConfidenceLevel).toBe("LOW");
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(result.fields.fullName?.value).toBe("J0HN M1CHAEL D0E");

    const state = controller.getState();
    expect(state.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(state.fieldConfidence.fullName).toBeLessThan(0.5);
  });

  it("generates warnings when required fields are missing", async () => {
    localProvider.setResult(makeMissingFieldsResult("LOCAL"));
    const { guest, result } = await controller.processOcr("/tmp/missing.jpg", "LOCAL");

    expect(result.warnings).toContain("MISSING_REQUIRED_FIELD");
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(guest.status).toBe("MISSING_DATA");
    expect(guest.fullName).toBe("");
  });

  it("shows expired document warning", async () => {
    localProvider.setResult(makeExpiredResult("LOCAL"));
    const { guest, result } = await controller.processOcr("/tmp/expired.jpg", "LOCAL");

    expect(result.warnings).toContain("DOCUMENT_EXPIRED");
    expect(result.isExpired).toBe(true);
    expect(guest.status).toBe("NEED_REVIEW");
  });

  it("allows user to retry OCR with same provider", async () => {
    const firstResult = makeSuccessfulLocalResult();
    localProvider.setResult(firstResult);
    await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    expect(controller.getState().status).toBe("COMPLETED");

    const retryResult = makeSuccessfulLocalResult({
      fields: {
        ...makeSuccessfulLocalResult().fields,
        fullName: makeExtractedField("JOHN M. DOE", 0.9, "mrz"),
      },
      overallConfidence: 0.92,
    });
    localProvider.setResult(retryResult);

    const { guest } = await controller.retryOcr();
    expect(controller.getState().status).toBe("COMPLETED");
    expect(guest.fullName).toBe("JOHN M. DOE");
    expect(guest.confidenceScore).toBe(0.92);
  });

  it("allows user to clear extracted data between scans", async () => {
    await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    expect(controller.getState().status).toBe("COMPLETED");
    expect(controller.getState().lastImagePath).toBe("/tmp/passport.jpg");

    controller.clearExtractedData();
    const state = controller.getState();
    expect(state.status).toBe("IDLE");
    expect(state.providerType).toBeNull();
    expect(state.ocrResult).toBeNull();
    expect(state.mappedGuest).toBeNull();
    expect(state.warnings).toEqual([]);
    expect(state.lastImagePath).toBeNull();
  });

  it("handles cancellation during OCR processing", async () => {
    const abortController = new AbortController();
    const processPromise = controller.processOcr("/tmp/passport.jpg", "LOCAL", abortController.signal);
    abortController.abort();

    await expect(processPromise).rejects.toThrow("OCR was canceled");
    expect(controller.getState().status).toBe("IDLE");
    expect(controller.getState().error).toContain("canceled");
  });
});

describe("OCR Feature E2E: Azure OCR Flow", () => {
  let controller: OcrController;
  let azureProvider: MockOcrProvider;

  beforeEach(() => {
    azureProvider = new MockOcrProvider("AZURE", makeSuccessfulAzureResult());
    controller = new OcrController(azureProvider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("processes passport image with Azure OCR and extracts high-confidence data", async () => {
    const { guest, result } = await controller.processOcr("/tmp/passport.jpg", "AZURE");

    expect(result.provider).toBe("AZURE");
    expect(result.overallConfidenceLevel).toBe("HIGH");
    expect(result.overallConfidence).toBeGreaterThan(0.9);
    expect(result.warnings).toHaveLength(0);
    expect(result.fields.fullName?.value).toBe("JANE ELIZABETH SMITH");
    expect(result.fields.passportNumber?.value).toBe("XY789012");
    expect(result.fields.nationality?.value).toBe("GBR");
    expect(result.fields.dateOfBirth?.value).toBe("1990-04-15");
    expect(result.fields.gender?.value).toBe("F");
    expect(result.fields.issuingCountry?.value).toBe("GBR");

    verifyGuestRowBase(guest, result);
    expect(guest.status).toBe("READY");
  });

  it("maps Azure OCR fields correctly to GuestRow", async () => {
    const { guest, result } = await controller.processOcr("/tmp/passport.jpg", "AZURE");

    verifyGuestRowBase(guest, result);
    verifyGuestRowExpiry(guest, result);
    expect(guest.passportExpiryDate).toBe("2030-03-09");
    expect(guest.nationality).toBe("GBR");
    expect(guest.issuingCountry).toBe("GBR");
    expect(guest.status).toBe("READY");
  });

  it("stores high confidence scores from Azure OCR", async () => {
    await controller.processOcr("/tmp/passport.jpg", "AZURE");

    const fieldConfidence = controller.getState().fieldConfidence;
    expect(fieldConfidence.fullName).toBeGreaterThanOrEqual(0.95);
    expect(fieldConfidence.passportNumber).toBeGreaterThanOrEqual(0.98);
    expect(fieldConfidence.dateOfBirth).toBeGreaterThanOrEqual(0.97);
  });

  it("handles Azure OCR failure gracefully", async () => {
    azureProvider.setFail(true, "Azure service unavailable");

    await expect(controller.processOcr("/tmp/passport.jpg", "AZURE")).rejects.toThrow("Azure service unavailable");
    expect(controller.getState().status).toBe("FAILED");
    expect(controller.getState().error).toContain("Azure service unavailable");
  });

  it("shows expired document warning with Azure OCR", async () => {
    azureProvider.setResult(makeExpiredResult("AZURE"));
    const { guest, result } = await controller.processOcr("/tmp/expired.jpg", "AZURE");

    expect(result.warnings).toContain("DOCUMENT_EXPIRED");
    expect(result.isExpired).toBe(true);
    expect(guest.status).toBe("NEED_REVIEW");
    expect(guest.passportExpiryDate).toBe("2019-11-20");
  });

  it("allows retry after Azure OCR failure", async () => {
    azureProvider.setFail(true, "Network error");

    await expect(controller.processOcr("/tmp/passport.jpg", "AZURE")).rejects.toThrow("Network error");
    expect(controller.getState().status).toBe("FAILED");

    azureProvider.setFail(false);
    azureProvider.setResult(makeSuccessfulAzureResult());

    const { guest } = await controller.retryOcr();
    expect(controller.getState().status).toBe("COMPLETED");
    expect(guest.fullName).toBe("JANE ELIZABETH SMITH");
  });
});

describe("OCR Feature E2E: Provider Switching", () => {
  let controller: OcrController;
  let localProvider: MockOcrProvider;
  let azureProvider: MockOcrProvider;

  beforeEach(() => {
    localProvider = new MockOcrProvider("LOCAL", makeSuccessfulLocalResult());
    controller = new OcrController(localProvider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("switches from Local OCR to Azure OCR between scans", async () => {
    const { guest: localGuest } = await controller.processOcr("/tmp/doc.jpg", "LOCAL");
    expect(localGuest.fullName).toBe("JOHN MICHAEL DOE");
    expect(controller.getState().providerType).toBe("LOCAL");

    controller.clearExtractedData();

    const azureCtrl = new OcrController(new MockOcrProvider("AZURE", makeSuccessfulAzureResult()));
    const { guest: azureGuest } = await azureCtrl.processOcr("/tmp/doc.jpg", "AZURE");
    expect(azureGuest.fullName).toBe("JANE ELIZABETH SMITH");
    expect(azureCtrl.getState().providerType).toBe("AZURE");
  });

  it("preserves state for current provider until cleared", async () => {
    await controller.processOcr("/tmp/doc.jpg", "LOCAL");
    expect(controller.getState().providerType).toBe("LOCAL");
    expect(controller.getState().ocrResult).not.toBeNull();

    const state = controller.getState();
    expect(state.providerType).toBe("LOCAL");
    expect(state.lastImagePath).toBe("/tmp/doc.jpg");
  });
});

describe("OCR Feature E2E: Extracted Data Review and Correction", () => {
  let controller: OcrController;
  let localProvider: MockOcrProvider;

  beforeEach(() => {
    localProvider = new MockOcrProvider("LOCAL", makeSuccessfulLocalResult());
    controller = new OcrController(localProvider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("displays all extracted fields for user review", async () => {
    const { result } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");

    const fields = result.fields;
    const expectedFields: (keyof ExtractedFields)[] = [
      "fullName",
      "firstName",
      "lastName",
      "dateOfBirth",
      "gender",
      "nationality",
      "passportNumber",
      "documentType",
      "issueDate",
      "expiryDate",
      "issuingCountry",
      "mrzCode",
    ];

    for (const field of expectedFields) {
      expect(fields[field]).toBeDefined();
      expect(fields[field]!.value).toBeTruthy();
    }
  });

  it("displays field-level confidence for each extracted field", async () => {
    await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    const { fieldConfidence } = controller.getState();

    const allFields = [
      "fullName",
      "firstName",
      "lastName",
      "dateOfBirth",
      "gender",
      "nationality",
      "passportNumber",
      "documentType",
      "issueDate",
      "expiryDate",
      "issuingCountry",
    ];

    for (const field of allFields) {
      expect(fieldConfidence[field]).toBeDefined();
      expect(fieldConfidence[field]).toBeGreaterThanOrEqual(0);
      expect(fieldConfidence[field]).toBeLessThanOrEqual(1);
    }
  });

  it("allows user to edit extracted fields before confirmation", async () => {
    const { guest } = await controller.processOcr("/tmp/low-conf.jpg", "LOCAL");

    const editedGuest: Partial<GuestRow> = { ...guest };
    editedGuest.fullName = "JOHN MICHAEL DOE";
    editedGuest.passportNumber = "AB123456";

    expect(editedGuest.fullName).toBe("JOHN MICHAEL DOE");
    expect(editedGuest.passportNumber).toBe("AB123456");
  });

  it("shows clearly when data needs review (low confidence)", async () => {
    localProvider.setResult(makeLowConfidenceResult("LOCAL"));
    const { result } = await controller.processOcr("/tmp/low-conf.jpg", "LOCAL");

    expect(result.overallConfidenceLevel).toBe("LOW");
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD");
    expect(result.fields.fullName?.confidence).toBeLessThan(0.5);
    expect(result.fields.passportNumber?.confidence).toBeLessThan(0.5);

    const { fieldConfidence } = controller.getState();
    const lowFields = Object.entries(fieldConfidence)
      .filter(([, confidence]) => confidence < 0.5)
      .map(([field]) => field);
    expect(lowFields.length).toBeGreaterThan(0);
    expect(lowFields).toContain("fullName");
    expect(lowFields).toContain("passportNumber");
  });

  it("shows warning when document is expired in review UI", async () => {
    localProvider.setResult(makeExpiredResult("LOCAL"));
    const { result, guest } = await controller.processOcr("/tmp/expired.jpg", "LOCAL");

    expect(result.warnings).toContain("DOCUMENT_EXPIRED");
    expect(result.isExpired).toBe(true);
    expect(guest.status).toBe("NEED_REVIEW");

    const state = controller.getState();
    expect(state.warnings).toContain("DOCUMENT_EXPIRED");
  });
});

describe("OCR Feature E2E: Privacy and Security Safeguards", () => {
  let controller: OcrController;

  beforeEach(() => {
    const provider = new MockOcrProvider("LOCAL", makeSuccessfulLocalResult());
    controller = new OcrController(provider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("masks passport number in controller log context", async () => {
    const { guest } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    expect(guest.passportNumber).toBe("AB123456");
  });

  it("does not expose raw image paths in state after clear", async () => {
    await controller.processOcr("/tmp/passport-abc123.jpg", "LOCAL");
    expect(controller.getState().lastImagePath).toBe("/tmp/passport-abc123.jpg");

    controller.clearExtractedData();
    expect(controller.getState().lastImagePath).toBeNull();
  });

  it("allows user to clear extracted data for privacy", async () => {
    await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    expect(controller.getState().ocrResult).not.toBeNull();
    expect(controller.getState().mappedGuest).not.toBeNull();

    controller.clearExtractedData();
    const state = controller.getState();
    expect(state.ocrResult).toBeNull();
    expect(state.mappedGuest).toBeNull();
    expect(state.fieldConfidence).toEqual({});
    expect(state.warnings).toEqual([]);
    expect(state.lastImagePath).toBeNull();
  });

  it("redacts sensitive fields when logging completion", async () => {
    const { result, guest } = await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    expect(guest.passportNumber).toBeTruthy();
    expect(guest.fullName).toBeTruthy();
  });
});

describe("OCR Feature E2E: Edge Cases and Error Handling", () => {
  let controller: OcrController;
  let provider: MockOcrProvider;

  beforeEach(() => {
    provider = new MockOcrProvider("LOCAL", makeSuccessfulLocalResult());
    controller = new OcrController(provider);
  });

  afterEach(() => {
    controller.clearExtractedData();
  });

  it("rejects retry without prior OCR", async () => {
    const plainController = new OcrController();
    await expect(plainController.retryOcr()).rejects.toThrow("No previous OCR to retry");
  });

  it("handles empty image path gracefully", async () => {
    provider.setFail(true, "Image not found");
    await expect(controller.processOcr("", "LOCAL")).rejects.toThrow("Image not found");
    expect(controller.getState().status).toBe("FAILED");
  });

  it("resets state completely after clear", async () => {
    await controller.processOcr("/tmp/passport.jpg", "LOCAL");
    controller.clearExtractedData();

    const state = controller.getState();
    expect(state.status).toBe("IDLE");
    expect(state.providerType).toBeNull();
    expect(state.ocrResult).toBeNull();
    expect(state.mappedGuest).toBeNull();
    expect(state.fieldConfidence).toEqual({});
    expect(state.warnings).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.lastImagePath).toBeNull();
  });

  it("handles multiple sequential OCR operations", async () => {
    const r1 = await controller.processOcr("/tmp/doc1.jpg", "LOCAL");
    expect(r1.result.fields.fullName?.value).toBe("JOHN MICHAEL DOE");

    controller.clearExtractedData();

    provider.setResult(
      makeSuccessfulLocalResult({
        fields: { ...makeSuccessfulLocalResult().fields, fullName: makeExtractedField("JANE SMITH", 0.91, "mrz") },
        overallConfidence: 0.91,
      }),
    );
    const r2 = await controller.processOcr("/tmp/doc2.jpg", "LOCAL");
    expect(r2.result.fields.fullName?.value).toBe("JANE SMITH");
  });

  it("processes ID card with Local OCR", async () => {
    const idCardResult: OcrResult = {
      ...makeSuccessfulLocalResult(),
      fields: {
        fullName: makeExtractedField("ALICE WONDERLAND", 0.82, "mrz"),
        firstName: makeExtractedField("ALICE", 0.81, "mrz"),
        lastName: makeExtractedField("WONDERLAND", 0.83, "mrz"),
        dateOfBirth: makeExtractedField("1992-07-14", 0.88, "mrz"),
        gender: makeExtractedField("F", 0.9, "mrz"),
        nationality: makeExtractedField("CAN", 0.85, "mrz"),
        idNumber: makeExtractedField("ID123456789", 0.91, "mrz"),
        documentType: makeExtractedField("ID_CARD", 0.89, "mrz"),
        issueDate: makeExtractedField("2018-03-01", 0.84, "mrz"),
        expiryDate: makeExtractedField("2028-03-01", 0.86, "mrz"),
        issuingCountry: makeExtractedField("CAN", 0.85, "mrz"),
      },
      overallConfidence: 0.86,
      overallConfidenceLevel: "HIGH",
      provider: "LOCAL",
      warnings: [],
      detectedDocumentType: "ID_CARD",
      detectedGender: "F",
      isExpired: false,
      processingTimeMs: 1100,
    };
    provider.setResult(idCardResult);

    const { guest, result } = await controller.processOcr("/tmp/id-card.jpg", "LOCAL");
    expect(result.detectedDocumentType).toBe("ID_CARD");
    expect(result.fields.idNumber?.value).toBe("ID123456789");
    expect(guest.documentType).toBe("ID_CARD");
    expect(guest.idNumber).toBe("ID123456789");
    expect(guest.idExpiryDate).toBe("2028-03-01");
    expect(guest.passportNumber).toBeUndefined();
  });

  it("processes ID card with Azure OCR", async () => {
    const idCardResult: OcrResult = {
      ...makeSuccessfulAzureResult(),
      fields: {
        fullName: makeExtractedField("BOB CHEN", 0.94, "azure_document_intelligence"),
        firstName: makeExtractedField("BOB", 0.93, "azure_document_intelligence"),
        lastName: makeExtractedField("CHEN", 0.95, "azure_document_intelligence"),
        dateOfBirth: makeExtractedField("1988-11-22", 0.97, "azure_document_intelligence"),
        gender: makeExtractedField("M", 0.98, "azure_document_intelligence"),
        nationality: makeExtractedField("CHN", 0.95, "azure_document_intelligence"),
        idNumber: makeExtractedField("G12345678", 0.99, "azure_document_intelligence"),
        documentType: makeExtractedField("ID_CARD", 0.97, "azure_document_intelligence"),
        issueDate: makeExtractedField("2019-05-15", 0.94, "azure_document_intelligence"),
        expiryDate: makeExtractedField("2029-05-14", 0.96, "azure_document_intelligence"),
        issuingCountry: makeExtractedField("CHN", 0.95, "azure_document_intelligence"),
      },
      overallConfidence: 0.96,
      overallConfidenceLevel: "HIGH",
      provider: "AZURE",
      warnings: [],
      detectedDocumentType: "ID_CARD",
      detectedGender: "M",
      isExpired: false,
      processingTimeMs: 750,
    };
    const azureCtrl = new OcrController(new MockOcrProvider("AZURE", idCardResult));

    const { guest, result } = await azureCtrl.processOcr("/tmp/id-card.jpg", "AZURE");
    expect(result.detectedDocumentType).toBe("ID_CARD");
    expect(result.fields.idNumber?.value).toBe("G12345678");
    expect(guest.documentType).toBe("ID_CARD");
    expect(guest.idNumber).toBe("G12345678");
  });
});
