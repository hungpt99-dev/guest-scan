import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapGender,
  mapDocumentType,
  serializeWarnings,
  getGuestStatus,
  mapOcrResultToGuestRow,
  logOcrCompletion,
} from "../../ocr/utils/mapping";
import type { OcrResult } from "@guestfill/shared";
import { createMockPassportResult } from "../../ocr/mock-ocr-provider";

const mockLoggerInfo = vi.hoisted(() => vi.fn());
vi.mock("../../lib/logger", () => ({
  logger: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("mapGender", () => {
  it("returns valid gender", () => {
    expect(mapGender("M")).toBe("M");
    expect(mapGender("F")).toBe("F");
    expect(mapGender("X")).toBe("X");
  });

  it("returns UNKNOWN for UNKNOWN", () => {
    expect(mapGender("UNKNOWN")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for undefined", () => {
    expect(mapGender(undefined)).toBe("UNKNOWN");
  });
});

describe("mapDocumentType", () => {
  it("returns valid document type", () => {
    expect(mapDocumentType("PASSPORT")).toBe("PASSPORT");
    expect(mapDocumentType("ID_CARD")).toBe("ID_CARD");
  });

  it("returns UNKNOWN for UNKNOWN", () => {
    expect(mapDocumentType("UNKNOWN")).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for undefined", () => {
    expect(mapDocumentType(undefined)).toBe("UNKNOWN");
  });
});

describe("serializeWarnings", () => {
  it("joins warnings with semicolon separator", () => {
    expect(serializeWarnings(["LOW_CONFIDENCE_FIELD", "DOCUMENT_EXPIRED"])).toBe(
      "LOW_CONFIDENCE_FIELD; DOCUMENT_EXPIRED",
    );
  });

  it("returns undefined for empty array", () => {
    expect(serializeWarnings([])).toBeUndefined();
  });
});

describe("getGuestStatus", () => {
  it("returns READY for high confidence mapped result", () => {
    const result = createMockPassportResult();
    result.warnings = [];
    result.isExpired = false;
    result.overallConfidenceLevel = "HIGH";
    expect(getGuestStatus(result, true)).toBe("READY");
  });

  it("returns FAILED when no fields mapped", () => {
    const result = createMockPassportResult();
    expect(getGuestStatus(result, false)).toBe("FAILED");
  });

  it("returns NEED_REVIEW when document is expired", () => {
    const result = createMockPassportResult();
    result.warnings = ["DOCUMENT_EXPIRED"];
    expect(getGuestStatus(result, true)).toBe("NEED_REVIEW");
  });

  it("returns MISSING_DATA when required field missing", () => {
    const result = createMockPassportResult();
    result.warnings = ["MISSING_REQUIRED_FIELD"];
    expect(getGuestStatus(result, true)).toBe("MISSING_DATA");
  });

  it("returns NEED_REVIEW for low confidence", () => {
    const result = createMockPassportResult();
    result.overallConfidenceLevel = "LOW";
    expect(getGuestStatus(result, true)).toBe("NEED_REVIEW");
  });

  it("prioritizes DOCUMENT_EXPIRED over MISSING_REQUIRED_FIELD", () => {
    const result = createMockPassportResult();
    result.warnings = ["DOCUMENT_EXPIRED", "MISSING_REQUIRED_FIELD"];
    expect(getGuestStatus(result, true)).toBe("NEED_REVIEW");
  });

  it("prioritizes MISSING_REQUIRED_FIELD over low confidence NEED_REVIEW", () => {
    const result = createMockPassportResult();
    result.warnings = ["MISSING_REQUIRED_FIELD"];
    result.overallConfidenceLevel = "LOW";
    expect(getGuestStatus(result, true)).toBe("MISSING_DATA");
  });
});

describe("mapOcrResultToGuestRow", () => {
  it("maps passport OCR result to guest row", () => {
    const result = createMockPassportResult();
    const guest = mapOcrResultToGuestRow(result);

    expect(guest.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(guest.surname).toBe("MUSTER");
    expect(guest.givenName).toBe("JOHN MICHAEL");
    expect(guest.passportNumber).toBe("AB123456");
    expect(guest.nationality).toBe("UTO");
    expect(guest.dateOfBirth).toBe("1985-10-10");
    expect(guest.gender).toBe("M");
    expect(guest.documentType).toBe("PASSPORT");
    expect(guest.status).toBe("NEED_REVIEW");
    expect(guest.confidenceScore).toBe(0.98);
    expect(guest.confidenceLevel).toBe("HIGH");
    expect(guest.fieldConfidence).toBeDefined();
    expect(guest.fieldConfidence?.fullName).toBe(0.98);
    expect(guest.ocrWarning).toBe("DOCUMENT_EXPIRED");
  });

  it("sets passportExpiryDate for PASSPORT type", () => {
    const result = createMockPassportResult();
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.passportExpiryDate).toBe("2020-01-01");
    expect(guest.idExpiryDate).toBeUndefined();
  });

  it("sets idExpiryDate for ID_CARD type", () => {
    const result = createMockPassportResult();
    result.detectedDocumentType = "ID_CARD";
    result.fields.expiryDate = { value: "2025-12-31", confidence: 0.99 };
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.idExpiryDate).toBe("2025-12-31");
    expect(guest.passportExpiryDate).toBeUndefined();
  });

  it("sets passportExpiryDate by default when document type is unknown", () => {
    const result = createMockPassportResult();
    result.detectedDocumentType = "UNKNOWN";
    result.fields.expiryDate = { value: "2025-12-31", confidence: 0.99 };
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.passportExpiryDate).toBe("2025-12-31");
    expect(guest.idExpiryDate).toBeUndefined();
  });

  it("handles empty fields gracefully", () => {
    const result: OcrResult = {
      fields: {},
      rawText: "",
      overallConfidence: 0,
      overallConfidenceLevel: "LOW",
      provider: "LOCAL",
      warnings: [],
      processingTimeMs: 0,
    };
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.fullName).toBe("");
    expect(guest.status).toBe("FAILED");
    expect(guest.documentType).toBe("UNKNOWN");
    expect(guest.gender).toBe("UNKNOWN");
  });

  it("serializes warnings to string", () => {
    const result = createMockPassportResult();
    result.warnings = ["DOCUMENT_EXPIRED", "LOW_CONFIDENCE_FIELD"];
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.ocrWarning).toBe("DOCUMENT_EXPIRED; LOW_CONFIDENCE_FIELD");
  });

  it("builds fieldConfidence map", () => {
    const result = createMockPassportResult();
    const guest = mapOcrResultToGuestRow(result);
    expect(guest.fieldConfidence).toBeDefined();
    expect(Object.keys(guest.fieldConfidence!)).toContain("fullName");
    expect(Object.keys(guest.fieldConfidence!)).toContain("passportNumber");
  });
});

describe("logOcrCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs OCR completion info", () => {
    const result = createMockPassportResult();
    const guest = mapOcrResultToGuestRow(result);
    logOcrCompletion(result, guest);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "OcrController: OCR completed",
      expect.objectContaining({
        provider: "LOCAL",
        overallConfidence: 0.98,
        fieldCount: expect.any(Number),
        warnings: expect.any(Array),
        processingTimeMs: expect.any(Number),
      }),
    );
  });

  it("masks sensitive data in log context", () => {
    const result = createMockPassportResult();
    const guest = mapOcrResultToGuestRow(result);
    logOcrCompletion(result, guest);

    const context = mockLoggerInfo.mock.calls[0]?.[1];
    expect(context.maskedName).toContain("MUSTER");
    expect(context.maskedName).toContain("***");
    expect(context.maskedPassport).toContain("AB12");
    expect(context.maskedPassport).toContain("****");
  });
});
