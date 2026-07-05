import type { OcrResult, ExtractedField, ExtractedFields, OcrProviderType, OcrWarningCode } from "@guestfill/shared";
import { BaseOcrProvider } from "./base-ocr-provider";
import { getConfidenceLevel, makeField } from "./utils/normalization";

export type MockOcrConfig = {
  fields?: Partial<ExtractedFields>;
  overallConfidence?: number;
  warnings?: OcrWarningCode[];
  shouldFail?: boolean;
  failMessage?: string;
  processingTimeMs?: number;
};

export class MockOcrProvider extends BaseOcrProvider {
  readonly name = "MockOCR";
  readonly type: OcrProviderType = "LOCAL";

  private config: MockOcrConfig;

  constructor(config: MockOcrConfig = {}) {
    super();
    this.config = config;
    this._isAvailable = true;
    this.initialized = true;
  }

  setConfig(config: MockOcrConfig): void {
    this.config = config;
  }

  setAvailable(available: boolean): void {
    this._isAvailable = available;
  }

  protected async checkAvailability(): Promise<boolean> {
    return true;
  }

  async processImage(_imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    this.checkCanceled();

    const cleanup = this.setupAbortSignal(signal);
    try {
      this.checkCanceled();

      if (this.config.shouldFail) {
        throw new Error(this.config.failMessage ?? "Mock OCR provider failed");
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      this.checkCanceled();

      const fields: ExtractedFields = {};
      if (this.config.fields) {
        for (const [key, field] of Object.entries(this.config.fields)) {
          if (field) {
            fields[key as keyof ExtractedFields] = field as ExtractedField;
          }
        }
      }

      const overallConfidence = this.config.overallConfidence ?? 0.95;
      const overallConfidenceLevel = getConfidenceLevel(overallConfidence);

      return {
        fields,
        rawText: "Mock OCR result",
        overallConfidence,
        overallConfidenceLevel,
        provider: this.type,
        warnings: this.config.warnings ?? [],
        processingTimeMs: this.config.processingTimeMs ?? 100,
      };
    } finally {
      if (cleanup) cleanup();
    }
  }
}

export function createMockOcrResult(overrides?: Partial<OcrResult>): OcrResult {
  return {
    fields: {},
    rawText: "",
    overallConfidence: 0.95,
    overallConfidenceLevel: "HIGH",
    provider: "LOCAL",
    warnings: [],
    ...overrides,
  };
}

export function createMockPassportResult(): OcrResult {
  return {
    fields: {
      fullName: makeField("MUSTER JOHN MICHAEL", 0.98, "mrz"),
      lastName: makeField("MUSTER", 0.98, "mrz"),
      firstName: makeField("JOHN MICHAEL", 0.98, "mrz"),
      dateOfBirth: makeField("1985-10-10", 0.99, "mrz"),
      gender: makeField("M", 0.99, "mrz"),
      nationality: makeField("UTO", 0.98, "mrz"),
      passportNumber: makeField("AB123456", 0.99, "mrz"),
      documentType: makeField("PASSPORT", 0.98, "mrz"),
      expiryDate: makeField("2020-01-01", 0.99, "mrz"),
      issueDate: makeField("2015-01-01", 0.97, "mrz"),
      issuingCountry: makeField("UTO", 0.98, "mrz"),
      mrzCode: makeField(
        "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
        0.95,
        "mrz",
      ),
    },
    rawText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    overallConfidence: 0.98,
    overallConfidenceLevel: "HIGH",
    provider: "LOCAL",
    warnings: ["DOCUMENT_EXPIRED"],
    detectedDocumentType: "PASSPORT",
    detectedGender: "M",
    isExpired: true,
    processingTimeMs: 150,
  };
}
