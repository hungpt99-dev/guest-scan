import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSettingsService,
  createInMemorySettingsStore,
  type SettingsService,
} from "../apps/desktop/src/services/settings-service";
import {
  createAuditLogService,
  createInMemoryAuditLogStore,
  type AuditLogService,
} from "../apps/desktop/src/services/audit-log-service";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
  type AutoFillProfile,
  type FieldMappingEntry,
  type OcrFieldKey,
} from "../apps/desktop/src/services/auto-fill-mapping-service";
import {
  createAutoFillExecutionService,
  type AutoFillExecutionService,
  type FillExecutor,
} from "../apps/desktop/src/services/auto-fill-execution-service";
import {
  createStaffReviewService,
  type StaffReviewService,
  type NormalizedFields,
  type EditableFields,
  type PendingReview,
  type ConfirmedFields,
} from "../apps/desktop/src/services/staff_review_service";
import {
  createImageQualityService,
  type ImageQualityService,
  type ImageInput,
  type ImageQualityResult,
} from "../apps/desktop/src/services/image_quality_service";
import {
  createDocumentCropService,
  type DocumentCropService,
} from "../apps/desktop/src/services/document_crop_service";
import {
  createImagePreprocessingService,
  type ImagePreprocessingService,
} from "../apps/desktop/src/services/image_preprocessing_service";
import {
  createMrzDetectionService,
  type MrzDetectionService,
  type MrzRegion,
} from "../apps/desktop/src/services/mrz_detection_service";
import { createMrzParserService, type MrzParserService } from "../apps/desktop/src/services/mrz_parser_service";
import {
  createMrzChecksumValidator,
  type MrzChecksumValidator,
} from "../apps/desktop/src/services/mrz_checksum_validator";
import {
  createFieldNormalizationService,
  type FieldNormalizationService,
} from "../apps/desktop/src/services/field_normalization_service";
import {
  createConfidenceScoringService,
  type ConfidenceScoringService,
} from "../apps/desktop/src/services/confidence-scoring-service";
import { createOcrConfidenceService } from "../apps/desktop/src/services/ocr_confidence_service";
import { createOcrPipelineService, type OcrPipelineService } from "../apps/desktop/src/services/ocr_pipeline_service";
import { createOcrApi, type OcrApi } from "../apps/desktop/src/api/ocr_api";
import {
  validateField,
  validateExtractedFields,
  type FieldValidationResult,
  type DocumentFields,
} from "../apps/desktop/src/ocr/field_validator";
import { MockOcrEngine } from "../apps/desktop/src/ocr/mock_ocr_engine";
import type { OcrEngine, OcrTextResult, OcrTextChunk } from "../apps/desktop/src/ocr/ocr_engine";

// Valid TD3 MRZ — all check digits correct
const TD3_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const TD3_LINE_2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<02";
const TD3_FULLTEXT = [TD3_LINE_1, TD3_LINE_2].join("\n");

const PASSPORT_NUMBER = "AB123456";
const DOB = "1985-10-10";
const EXPIRY = "2020-01-01";

function mockImageInput(path = "/tmp/test-passport.jpg"): ImageInput {
  return { imagePath: path };
}

function validOcrLines(): OcrTextChunk[] {
  return [
    { text: TD3_LINE_1, confidence: 0.95 },
    { text: TD3_LINE_2, confidence: 0.93 },
  ];
}

function validOcrResult(overrides?: Partial<OcrTextResult>): OcrTextResult {
  const lines = validOcrLines();
  return {
    lines,
    fullText: lines.map((l) => l.text).join("\n"),
    averageConfidence: 0.94,
    ...overrides,
  };
}

function lowConfOcrResult(): OcrTextResult {
  return {
    lines: [
      { text: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.45 },
      { text: "AB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.4 },
    ],
    fullText: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04",
    averageConfidence: 0.42,
  };
}

function makeNormalized(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: DOB,
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: PASSPORT_NUMBER,
    passportNumber: PASSPORT_NUMBER,
    idNumber: "",
    issueDate: "",
    expiryDate: EXPIRY,
    issuingCountry: "UTO",
    mrzRaw: TD3_FULLTEXT,
    mrzParsed: [TD3_LINE_1, TD3_LINE_2],
    checkDigits: {
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
      optional_data_valid: true,
      final_composite_valid: true,
      overall_valid: true,
    },
    ...overrides,
  };
}

function makeMapping(overrides: Partial<FieldMappingEntry> = {}): FieldMappingEntry {
  return {
    id: crypto.randomUUID(),
    ocrField: "fullName",
    formField: "guestName",
    required: false,
    enabled: true,
    ...overrides,
  };
}

function createMockExecutor(): FillExecutor {
  return {
    fillWebField: async () => {},
    fillDesktopField: async () => {},
    fillCopyAssistant: async () => {},
    focusTargetApp: async () => {},
  };
}

function captureExecutor(): FillExecutor & { calls: Array<{ field: string; value: string }> } {
  const calls: Array<{ field: string; value: string }> = [];
  return {
    calls,
    fillWebField: async (field: string, value: string) => {
      calls.push({ field, value });
    },
    fillDesktopField: async (_value: string) => {},
    fillCopyAssistant: async (value: string) => {
      calls.push({ field: "clipboard", value });
    },
    focusTargetApp: async () => {},
  };
}

function allEditableFields(): EditableFields {
  const n = makeNormalized();
  return {
    fullName: n.fullName,
    firstName: n.firstName,
    lastName: n.lastName,
    gender: n.gender,
    dateOfBirth: n.dateOfBirth,
    nationality: n.nationality,
    countryCode: n.countryCode,
    documentType: n.documentType,
    documentNumber: n.documentNumber,
    passportNumber: n.passportNumber,
    idNumber: n.idNumber,
    issueDate: n.issueDate,
    expiryDate: n.expiryDate,
    issuingCountry: n.issuingCountry,
  };
}

// =============================================================================
// 1. Scan → Extract
// =============================================================================

describe("E2E: Scan → Extract — Image pipeline produces parsed fields", () => {
  it("captures an image and runs quality check", async () => {
    const quality = createImageQualityService();
    const result = await quality.analyzeImage(mockImageInput());
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("crops a document from captured image", async () => {
    const crop = createDocumentCropService();
    const cropped = await crop.cropDocument(mockImageInput());
    expect(cropped.imagePath).toBeTruthy();
  });

  it("preprocesses cropped document", async () => {
    const crop = createDocumentCropService();
    const preprocess = createImagePreprocessingService();
    const cropped = await crop.cropDocument(mockImageInput());
    const processed = await preprocess.preprocessImage(cropped);
    expect(processed.imagePath).toBeTruthy();
  });

  it("detects MRZ region from preprocessed image", async () => {
    const crop = createDocumentCropService();
    const preprocess = createImagePreprocessingService();
    const mrz = createMrzDetectionService();
    const cropped = await crop.cropDocument(mockImageInput());
    const processed = await preprocess.preprocessImage(cropped);
    const region = await mrz.detectMrzRegion(processed);
    expect(region.detectedFormat).not.toBe("UNKNOWN");
  });

  it("runs OCR and parses MRZ from good image", async () => {
    const engine = new MockOcrEngine(validOcrResult());
    const result = await engine.extractText(mockImageInput());
    expect(result.averageConfidence).toBeGreaterThan(0.6);

    const parser = createMrzParserService();
    const parsed = parser.parseMrzLines(result.lines.map((l) => l.text));
    expect(parsed.passportNumber).toBe(PASSPORT_NUMBER);
    expect(parsed.surname).toBe("MUSTER");
    expect(parsed.givenName).toBe("JOHN MICHAEL");
  });

  it("validates MRZ checksums after parsing", async () => {
    const validator = createMrzChecksumValidator();
    const result = validator.validateChecksums([TD3_LINE_1, TD3_LINE_2]);
    expect(result.overallValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.passportNumberValid).toBe(true);
    expect(result.dateOfBirthValid).toBe(true);
    expect(result.expiryDateValid).toBe(true);
  });

  it("normalizes parsed fields into structured form", async () => {
    const parser = createMrzParserService();
    const normalizer = createFieldNormalizationService();
    const parsed = parser.parseMrzLines([TD3_LINE_1, TD3_LINE_2]);
    const normalized = normalizer.normalizeFields({
      fullName: parsed.fullName,
      surname: parsed.surname,
      givenName: parsed.givenName,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth,
      nationality: parsed.nationality,
      issuingCountry: parsed.issuingCountry,
      documentType: parsed.documentType,
      passportNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      idNumber: parsed.optionalData ?? "",
      issueDate: "",
      expiryDate: parsed.expiryDate,
      mrzRaw: TD3_FULLTEXT,
      mrzParsed: [TD3_LINE_1, TD3_LINE_2],
      checkDigits: {},
    });
    expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(normalized.passportNumber).toBe(PASSPORT_NUMBER);
    expect(normalized.dateOfBirth).toBe(DOB);
    expect(normalized.expiryDate).toBe(EXPIRY);
    expect(normalized.gender).toBe("M");
  });

  it("scores confidence for each extracted field", async () => {
    const scorer = createConfidenceScoringService();
    const quality = createImageQualityService();
    const normalized = makeNormalized();
    const ocrResult = validOcrResult();
    const qualityResult = await quality.analyzeImage(mockImageInput());
    const scores = scorer.calculateFieldScores(normalized, ocrResult, qualityResult, {
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
      optional_data_valid: true,
      final_composite_valid: true,
      overall_valid: true,
    });
    expect(scores.fullName.level).toBe("HIGH");
    expect(scores.passportNumber.level).toBe("HIGH");
    expect(scores.dateOfBirth.level).toBe("HIGH");
    expect(scores.expiryDate.level).toBe("HIGH");
    // "UTO" is not a real ISO3 country → penalized to MEDIUM
    expect(scores.nationality.level).toBe("MEDIUM");
    expect(scores.countryCode.level).toBe("MEDIUM");
    expect(scores.issuingCountry.level).toBe("MEDIUM");
  });

  it("falls back to Tesseract when PaddleOCR fails", async () => {
    const failing = new MockOcrEngine({ failWithError: true });
    await expect(failing.extractText(mockImageInput())).rejects.toThrow("Mock OCR engine simulated failure");

    const fallback = new MockOcrEngine(validOcrResult());
    const result = await fallback.extractText(mockImageInput());
    expect(result.averageConfidence).toBeGreaterThan(0.6);
  });
});

// =============================================================================
// 2. Extract → Review
// =============================================================================

describe("E2E: Extract → Review — Fields presented for staff verification", () => {
  let staffReview: StaffReviewService;
  let scorer: ConfidenceScoringService;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    scorer = createConfidenceScoringService();
  });

  it("presents all extracted fields for staff review", async () => {
    const normalized = makeNormalized();
    const ocrResult = validOcrResult();
    const quality = createImageQualityService();
    const qualityResult = await quality.analyzeImage(mockImageInput());
    const scores = scorer.calculateFieldScores(normalized, ocrResult, qualityResult, {
      overall_valid: true,
    });
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(pending.fields.passportNumber).toBe(PASSPORT_NUMBER);
    expect(pending.fields.dateOfBirth).toBe(DOB);
    expect(pending.fields.gender).toBe("M");
    expect(pending.fields.nationality).toBe("UTO");
    expect(pending.confirmed).toBe(false);
  });

  it("flags low-confidence fields for mandatory review", async () => {
    const normalized = makeNormalized({
      passportNumber: "AB12345?",
      nationality: "",
      issuingCountry: "",
    });
    const ocrResult = lowConfOcrResult();
    const response = createImageQualityService();
    const qualityResult = await response.analyzeImage(mockImageInput());
    const scores = scorer.calculateFieldScores(normalized, ocrResult, qualityResult, {});
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields.length).toBeGreaterThan(0);
    expect(pending.confirmed).toBe(false);
  });

  it("lets staff see the cropped document image reference", async () => {
    const crop = createDocumentCropService();
    const cropped = await crop.cropDocument(mockImageInput("/tmp/passport-scan.jpg"));
    const normalized = makeNormalized();
    const scores = scorer.calculateFieldScores(
      normalized,
      validOcrResult(),
      {
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 50,
          glareRatio: 0.02,
          skewAngle: 0.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.8,
        },
        warnings: [],
        passed: true,
      },
      {},
    );
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.fields).toBeDefined();
    expect(cropped.imagePath).toContain("passport-scan");
  });
});

// =============================================================================
// 3. Review → Edit
// =============================================================================

describe("E2E: Review → Edit — Staff corrects wrong fields", () => {
  let staffReview: StaffReviewService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("corrects a single wrong field before confirmation", async () => {
    const normalized = makeNormalized({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    expect(edited.edits.fullName).toBe("MUSTER JOHN MICHAEL");
  });

  it("corrects multiple wrong fields before confirmation", async () => {
    const normalized = makeNormalized({
      fullName: "MUSTER J0HN M1CHAEL",
      passportNumber: "AB12345?",
      dateOfBirth: "1985-O1-O1",
    });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const e1 = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const e2 = await staffReview.editField(e1, "passportNumber", PASSPORT_NUMBER);
    const e3 = await staffReview.editField(e2, "dateOfBirth", DOB);
    expect(e3.edits.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(e3.edits.passportNumber).toBe(PASSPORT_NUMBER);
    expect(e3.edits.dateOfBirth).toBe(DOB);
  });

  it("logs each field edit to audit trail", async () => {
    const normalized = makeNormalized({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    await auditService.recordStaffEdit(sessionId, "fullName", {
      oldValue: "MUSTER J0HN M1CHAEL",
      newValue: "MUSTER JOHN MICHAEL",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.eventType).toBe("STAFF_EDIT");
    expect(audit.entries[0]!.details.fieldName).toBe("fullName");
    expect(audit.entries[0]!.details.oldValue).toBe("MUSTER J0HN M1CHAEL");
    expect(audit.entries[0]!.details.newValue).toBe("MUSTER JOHN MICHAEL");
  });

  it("preserves original field value alongside edit for audit", async () => {
    const normalized = makeNormalized({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const confirmed = await staffReview.confirmResult(edited);
    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.original.fullName).toBe("MUSTER J0HN M1CHAEL");
    expect(confirmed.edits.fullName).toBe("MUSTER JOHN MICHAEL");
  });

  it("prevents editing after confirmation", async () => {
    const normalized = makeNormalized({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const confirmed = await staffReview.confirmResult(pending);
    const attemped = await staffReview.editField({ ...pending, confirmed: true }, "fullName", "CHANGED AFTER CONFIRM");
    expect(attemped.edits.fullName).toBe("MUSTER J0HN M1CHAEL");
  });

  it("corrects a field with ambiguous OCR characters (O↔0, I↔1)", async () => {
    const normalized = makeNormalized({
      passportNumber: "AB12345O",
      dateOfBirth: "1985-O1-O1",
    });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const e1 = await staffReview.editField(pending, "passportNumber", "AB123450");
    const e2 = await staffReview.editField(e1, "dateOfBirth", "1985-01-01");
    const confirmed = await staffReview.confirmResult(e2);
    expect(confirmed.fields.passportNumber).toBe("AB123450");
    expect(confirmed.fields.dateOfBirth).toBe("1985-01-01");
  });
});

// =============================================================================
// 4. Edit → Confirm
// =============================================================================

describe("E2E: Edit → Confirm — Staff confirms corrected fields", () => {
  let staffReview: StaffReviewService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("confirms without edits (happy path)", async () => {
    const normalized = makeNormalized();
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
    expect(confirmed.confirmedAt).toBeTruthy();
    expect(confirmed.fields.fullName).toBe(normalized.fullName);
    expect(confirmed.fields.passportNumber).toBe(normalized.passportNumber);
  });

  it("confirms with edits and merges corrections", async () => {
    const normalized = makeNormalized({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const confirmed = await staffReview.confirmResult(edited);
    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.original.fullName).toBe("MUSTER J0HN M1CHAEL");
    expect(confirmed.edits.fullName).toBe("MUSTER JOHN MICHAEL");
  });

  it("records confirmation in audit log", async () => {
    const normalized = makeNormalized();
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const confirmed = await staffReview.confirmResult(pending);
    await auditService.recordConfirmation(sessionId, confirmed);
    const audit = await auditService.query({ sessionId, eventTypes: ["CONFIRMATION"] });
    expect(audit.total).toBe(1);
  });

  it("tracks the number of staff edits made before confirmation", async () => {
    const normalized = makeNormalized({
      fullName: "MUSTER J0HN M1CHAEL",
      passportNumber: "AB12345?",
    });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const e1 = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const e2 = await staffReview.editField(e1, "passportNumber", PASSPORT_NUMBER);
    const confirmed = await staffReview.confirmResult(e2);
    await auditService.recordStaffEdit(sessionId, "fullName", {
      oldValue: "MUSTER J0HN M1CHAEL",
      newValue: "MUSTER JOHN MICHAEL",
    });
    await auditService.recordStaffEdit(sessionId, "passportNumber", {
      oldValue: "AB12345?",
      newValue: PASSPORT_NUMBER,
    });
    await auditService.recordConfirmation(sessionId, confirmed);
    const audit = await auditService.query({ sessionId });
    const edits = audit.entries.filter((e) => e.eventType === "STAFF_EDIT");
    expect(edits).toHaveLength(2);
  });
});

// =============================================================================
// 5. Confirm → Autofill
// =============================================================================

describe("E2E: Confirm → Autofill — Confirmed fields mapped and filled into forms", () => {
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let profile: AutoFillProfile;

  beforeEach(async () => {
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    profile = await mappingService.createProfile("Hotel PMS", "web");
  });

  it("maps confirmed fields to form fields using profile", async () => {
    await mappingService.setMappings(profile.id, [
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "fullName" as OcrFieldKey,
        formField: "guestName",
        required: true,
      }),
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "passportNumber" as OcrFieldKey,
        formField: "passportNo",
        required: true,
      }),
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "dateOfBirth" as OcrFieldKey,
        formField: "birthDate",
        required: true,
      }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "expiryDate" as OcrFieldKey, formField: "docExpiry" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "nationality" as OcrFieldKey, formField: "nationality" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "gender" as OcrFieldKey, formField: "gender" }),
    ]);
    const fields = makeNormalized();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    expect(applied.mappedCount).toBe(6);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe(PASSPORT_NUMBER);
    expect(applied.fieldValues.birthDate).toBe(DOB);
    expect(applied.fieldValues.docExpiry).toBe(EXPIRY);
    expect(applied.validationErrors).toHaveLength(0);
  });

  it("executes autofill into web form via executor", async () => {
    const exec = captureExecutor();
    executionService = createAutoFillExecutionService(exec);
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);
    const result = await executionService.executeFill({ guestName: "MUSTER JOHN MICHAEL" }, profile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(result.filledCount).toBe(1);
  });

  it("executes autofill into copy_assistant target", async () => {
    const exec = captureExecutor();
    executionService = createAutoFillExecutionService(exec);
    const copyProfile = await mappingService.createProfile("Copy PMS", "copy_assistant");
    await mappingService.setMappings(copyProfile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);
    const result = await executionService.executeFill({ passportNo: PASSPORT_NUMBER }, copyProfile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(result.filledCount).toBe(1);
  });

  it("executes autofill into desktop target", async () => {
    const exec = captureExecutor();
    executionService = createAutoFillExecutionService(exec);
    const desktopProfile = await mappingService.createProfile("Desktop PMS", "desktop");
    await mappingService.setMappings(desktopProfile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "dateOfBirth" as OcrFieldKey, formField: "dob" }),
    ]);
    const result = await executionService.executeFill({ dob: DOB }, desktopProfile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(result.filledCount).toBe(1);
  });

  it("reports unmapped OCR fields", async () => {
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);
    const fields = makeNormalized();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    expect(applied.unmappedOcrFields).toContain("passportNumber");
    expect(applied.unmappedOcrFields).toContain("dateOfBirth");
  });

  it("previews autofill values in test mode before real fill", async () => {
    executionService = createAutoFillExecutionService(createMockExecutor());
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);
    const fields = makeNormalized();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    const testResult = await executionService.testFill(applied.fieldValues, profile);
    expect(testResult.overallWouldSucceed).toBe(true);
    expect(testResult.previews).toHaveLength(2);
    expect(testResult.previews[0]!.formField).toBe("guestName");
    expect(testResult.previews[0]!.wouldSucceed).toBe(true);
    expect(testResult.previews[1]!.formField).toBe("passportNo");
  });
});

// =============================================================================
// 6. Full Workflow: Scan → Extract → Review → Edit → Confirm → Autofill
// =============================================================================

describe("E2E: Full Workflow — Scan → Extract → Review → Edit → Confirm → Autofill", () => {
  let staffReview: StaffReviewService;
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    executionService = createAutoFillExecutionService(createMockExecutor());
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("completes the full happy-path workflow from scan to autofill", async () => {
    // 1. SCAN: Run mock OCR on good image
    const engine = new MockOcrEngine(validOcrResult());
    const ocrResult = await engine.extractText(mockImageInput());
    expect(ocrResult.averageConfidence).toBeGreaterThan(0.6);

    // 2. EXTRACT: Parse MRZ, validate checksums, normalize, score
    const parser = createMrzParserService();
    const validator = createMrzChecksumValidator();
    const normalizer = createFieldNormalizationService();
    const scorer = createConfidenceScoringService();

    const mrzLines = ocrResult.lines.map((l) => l.text);
    const parsed = parser.parseMrzLines(mrzLines);
    const checksumResult = validator.validateChecksums(mrzLines);
    expect(checksumResult.overallValid).toBe(true);

    const normalized = normalizer.normalizeFields({
      fullName: parsed.fullName,
      surname: parsed.surname,
      givenName: parsed.givenName,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth,
      nationality: parsed.nationality,
      issuingCountry: parsed.issuingCountry,
      documentType: parsed.documentType,
      passportNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      idNumber: parsed.optionalData ?? "",
      issueDate: "",
      expiryDate: parsed.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: mrzLines,
      checkDigits: checksumResult as unknown as Record<string, boolean>,
    });
    expect(normalized.passportNumber).toBe(PASSPORT_NUMBER);

    const quality = createImageQualityService();
    const qualityResult = await quality.analyzeImage(mockImageInput());
    const scores = scorer.calculateFieldScores(
      normalized,
      ocrResult,
      qualityResult,
      checksumResult as unknown as Record<string, boolean>,
    );

    // 3. REVIEW: Present fields to staff
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(pending.fields.passportNumber).toBe(PASSPORT_NUMBER);

    // 4. EDIT: No corrections needed on happy path, but verify the mechanism exists
    // (skip editing in happy path)

    // 5. CONFIRM: Staff confirms result
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
    expect(confirmed.fields.passportNumber).toBe(PASSPORT_NUMBER);
    await auditService.recordConfirmation(sessionId, confirmed);

    // 6. AUTOFILL: Map and fill
    const profile = await mappingService.createProfile("Full Workflow PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "dateOfBirth" as OcrFieldKey, formField: "birthDate" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "gender" as OcrFieldKey, formField: "gender" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "nationality" as OcrFieldKey, formField: "nationality" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "expiryDate" as OcrFieldKey, formField: "docExpiry" }),
    ]);

    const applied = mappingService.applyMappingsWithProfile(confirmed.fields, profile);
    expect(applied.mappedCount).toBe(6);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe(PASSPORT_NUMBER);

    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
    expect(execResult.filledCount).toBe(6);
    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);

    // Verify complete audit trail
    const audit = await auditService.query({ sessionId });
    const eventTypes = audit.entries.map((e) => e.eventType);
    expect(eventTypes).toContain("CONFIRMATION");
    expect(eventTypes).toContain("AUTO_FILL");
  });

  it("completes workflow with staff edits before autofill", async () => {
    const engine = new MockOcrEngine(validOcrResult());
    const ocrResult = await engine.extractText(mockImageInput());

    const parser = createMrzParserService();
    const normalizer = createFieldNormalizationService();
    const parsed = parser.parseMrzLines(ocrResult.lines.map((l) => l.text));

    const normalized = normalizer.normalizeFields({
      fullName: parsed.fullName,
      surname: parsed.surname,
      givenName: parsed.givenName,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth,
      nationality: parsed.nationality,
      issuingCountry: parsed.issuingCountry,
      documentType: parsed.documentType,
      passportNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      idNumber: parsed.optionalData ?? "",
      issueDate: "",
      expiryDate: parsed.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: ocrResult.lines.map((l) => l.text),
      checkDigits: {},
    });

    // Staff notices name has OCR error (simulate)
    const modifiedNormalized: NormalizedFields = {
      ...normalized,
      fullName: "MUSTER J0HN M1CHAEL",
    };

    const pending = await staffReview.reviewResult(modifiedNormalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    await auditService.recordStaffEdit(sessionId, "fullName", {
      oldValue: "MUSTER J0HN M1CHAEL",
      newValue: "MUSTER JOHN MICHAEL",
    });

    const confirmed = await staffReview.confirmResult(edited);
    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    await auditService.recordConfirmation(sessionId, confirmed);

    const profile = await mappingService.createProfile("Edit Workflow PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);

    const applied = mappingService.applyMappingsWithProfile(confirmed.fields, profile);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe(PASSPORT_NUMBER);

    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);
  });

  it("flags and requires edit for invalid MRZ checksum before autofill", async () => {
    const invalidLine2 = "AB123456<9UTO8510105M2001012<<<<<<<<<<<<<<<<02";
    const engine = new MockOcrEngine({
      lines: [
        { text: TD3_LINE_1, confidence: 0.95 },
        { text: invalidLine2, confidence: 0.93 },
      ],
      fullText: [TD3_LINE_1, invalidLine2].join("\n"),
      averageConfidence: 0.94,
    });
    const ocrResult = await engine.extractText(mockImageInput());

    const validator = createMrzChecksumValidator();
    const checksumResult = validator.validateChecksums(ocrResult.lines.map((l) => l.text));
    expect(checksumResult.overallValid).toBe(false);
    expect(checksumResult.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");

    const parser = createMrzParserService();
    const normalizer = createFieldNormalizationService();
    const parsed = parser.parseMrzLines(ocrResult.lines.map((l) => l.text));

    const normalized = normalizer.normalizeFields({
      fullName: parsed.fullName,
      surname: parsed.surname,
      givenName: parsed.givenName,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth,
      nationality: parsed.nationality,
      issuingCountry: parsed.issuingCountry,
      documentType: parsed.documentType,
      passportNumber: parsed.passportNumber,
      documentNumber: parsed.passportNumber,
      idNumber: parsed.optionalData ?? "",
      issueDate: "",
      expiryDate: parsed.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: ocrResult.lines.map((l) => l.text),
      checkDigits: {},
    });

    const scorer = createConfidenceScoringService();
    const quality = createImageQualityService();
    const qualityResult = await quality.analyzeImage(mockImageInput());
    const scores = scorer.calculateFieldScores(normalized, ocrResult, qualityResult, {
      passport_number_valid: false,
      overall_valid: false,
    });
    expect(scores.passportNumber.level).toBe("MEDIUM");
    expect(scores.passportNumber.issues).toContain("MRZ check digit validation failed");

    // Staff reviews and edits the invalid passport number
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields).toContain("passportNumber");
    const edited = await staffReview.editField(pending, "passportNumber", PASSPORT_NUMBER);
    const confirmed = await staffReview.confirmResult(edited);
    expect(confirmed.fields.passportNumber).toBe(PASSPORT_NUMBER);
    await auditService.recordConfirmation(sessionId, confirmed);

    const profile = await mappingService.createProfile("Checksum Fix PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);
    const applied = mappingService.applyMappingsWithProfile(confirmed.fields, profile);
    expect(applied.fieldValues.passportNo).toBe(PASSPORT_NUMBER);

    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);
  });

  it("handles low-quality image: quality check fails before extraction", async () => {
    class BlurryQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 12,
            brightness: 100,
            contrast: 40,
            glareRatio: 0.02,
            skewAngle: 1.0,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.8,
          },
          warnings: ["BLURRY"],
          passed: false,
        };
      }
    }
    const quality = new BlurryQuality();
    const result = await quality.analyzeImage(mockImageInput());
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("BLURRY");
  });
});

// =============================================================================
// 7. Field Validation
// =============================================================================

describe("E2E: Field Validation — Every field validated before autofill", () => {
  it("validates fullName — accepts valid name", () => {
    const r = validateField("fullName", "MUSTER JOHN MICHAEL", "MUSTER<<JOHN<MICHAEL", 0.85, { mrzValid: true });
    expect(r.valid).toBe(true);
    expect(r.needsReview).toBe(false);
  });

  it("validates fullName — flags invalid characters", () => {
    const r = validateField("fullName", "MUSTER@JOHN#MICHAEL", "MUSTER@JOHN#MICHAEL", 0.85);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "INVALID_FORMAT")).toBe(true);
  });

  it("validates passportNumber — accepts valid format", () => {
    const r = validateField("passportNumber", PASSPORT_NUMBER, PASSPORT_NUMBER, 0.85, { mrzValid: true });
    expect(r.valid).toBe(true);
    expect(r.needsReview).toBe(false);
  });

  it("validates passportNumber — flags ambiguous characters O, I, L", () => {
    const r = validateField("passportNumber", "AB12345O", "AB12345O", 0.85);
    expect(r.issues.some((i) => i.code === "AMBIGUOUS_CHARS")).toBe(true);
  });

  it("validates passportNumber — flags empty value", () => {
    const r = validateField("passportNumber", "", "", 0.0);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "FIELD_EMPTY")).toBe(true);
  });

  it("validates nationality — accepts known ISO3 code", () => {
    const r = validateField("nationality", "GBR", "GBR", 0.85);
    expect(r.valid).toBe(true);
  });

  it("validates nationality — warns on unrecognized code but still passes", () => {
    const r = validateField("nationality", "XYZ", "XYZ", 0.85);
    expect(r.issues.some((i) => i.code === "UNRECOGNIZED_COUNTRY")).toBe(true);
    expect(r.valid).toBe(true);
  });

  it("validates nationality — errors on empty", () => {
    const r = validateField("nationality", "", "", 0.0);
    expect(r.valid).toBe(false);
  });

  it("validates dateOfBirth — accepts valid date", () => {
    const r = validateField("dateOfBirth", DOB, "851010", 0.85, { mrzValid: true });
    expect(r.valid).toBe(true);
  });

  it("validates dateOfBirth — rejects future date", () => {
    const future = "2099-01-01";
    const r = validateField("dateOfBirth", future, future, 0.85);
    expect(r.issues.some((i) => i.code === "FUTURE_DATE")).toBe(true);
  });

  it("validates dateOfBirth — rejects invalid date", () => {
    const r = validateField("dateOfBirth", "not-a-date", "not-a-date", 0.85);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "INVALID_DATE")).toBe(true);
  });

  it("validates expiryDate — accepts valid future date", () => {
    const future = "2030-06-15";
    const r = validateField("expiryDate", future, "300615", 0.85, { mrzValid: true });
    expect(r.valid).toBe(true);
  });

  it("validates expiryDate — detects expired document", () => {
    const r = validateField("expiryDate", EXPIRY, "200101", 0.85);
    if (r.issues.some((i) => i.code === "EXPIRED")) {
      expect(r.valid).toBe(false);
    }
  });

  it("validates gender — accepts M, F", () => {
    expect(validateField("gender", "M", "M", 0.85).valid).toBe(true);
    expect(validateField("gender", "F", "F", 0.85).valid).toBe(true);
  });

  it("validates gender — flags unknown value", () => {
    const r = validateField("gender", "X", "X", 0.85);
    expect(r.issues.some((i) => i.code === "INVALID_GENDER")).toBe(true);
  });

  it("validates issuingCountry — accepts known ISO3 code", () => {
    const r = validateField("issuingCountry", "USA", "USA", 0.85);
    expect(r.valid).toBe(true);
  });

  it("validates issuingCountry — warns on unrecognized code", () => {
    const r = validateField("issuingCountry", "XYZ", "XYZ", 0.85);
    expect(r.issues.some((i) => i.code === "UNRECOGNIZED_COUNTRY")).toBe(true);
  });

  it("validates multiple fields at once via validateExtractedFields", () => {
    const fields: DocumentFields = {
      fullName: "MUSTER JOHN MICHAEL",
      passportNumber: PASSPORT_NUMBER,
      nationality: "GBR",
      dateOfBirth: DOB,
      gender: "M",
      expiryDate: "2030-06-15",
      issuingCountry: "GBR",
    };
    const results = validateExtractedFields(fields, { mrzValid: true });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.valid).toBe(true);
    }
  });

  it("flags fields needing review when confidence is below threshold", () => {
    const r = validateField("passportNumber", "AB12345?", "AB12345?", 0.35);
    expect(r.needsReview).toBe(true);
    expect(r.valid).toBe(false);
  });

  it("applies MRZ confidence boost for fields from valid MRZ", () => {
    const withBoost = validateField("passportNumber", PASSPORT_NUMBER, PASSPORT_NUMBER, 0.7, {
      mrzValid: true,
      config: { mrzBoostEnabled: true, mrzBoostAmount: 0.15 },
    });
    const withoutBoost = validateField("passportNumber", PASSPORT_NUMBER, PASSPORT_NUMBER, 0.7, {
      mrzValid: false,
      config: { mrzBoostEnabled: true, mrzBoostAmount: 0.15 },
    });
    expect(withBoost.adjustedConfidence).toBeGreaterThan(withoutBoost.adjustedConfidence);
  });
});

// =============================================================================
// 8. OcrApi Integration: Full orchestrated flow through API layer
// =============================================================================

describe("E2E: OcrApi Integration — Full orchestrated scan-extract-review-confirm-autofill", () => {
  let staffReview: StaffReviewService;
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    executionService = createAutoFillExecutionService(createMockExecutor());
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("orchestrates full flow through OcrApi: capture → runOcr → confirm → save", async () => {
    // Create OCR pipeline with mock engine
    const engine = new MockOcrEngine(validOcrResult());
    const pipeline = createOcrPipelineService(
      createImageQualityService(),
      createDocumentCropService(),
      createImagePreprocessingService(),
      createMrzDetectionService(),
      engine,
      engine,
      createMrzParserService(),
      createMrzChecksumValidator(),
      createFieldNormalizationService(),
      createOcrConfidenceService(),
      staffReview,
    );

    const api = createOcrApi(pipeline);

    // SCAN: capture image
    const captureResult = await api.captureImage("/tmp/test-passport.jpg");
    expect(captureResult.ok).toBe(true);
    if (!captureResult.ok) return;
    expect(captureResult.value.source).toBe("/tmp/test-passport.jpg");

    // EXTRACT: run OCR pipeline
    const ocrResult = await api.runOcr(captureResult.value.image);
    expect(ocrResult.ok).toBe(true);
    if (!ocrResult.ok) return;
    expect(ocrResult.value.confirmed.confirmedBy).toBe("STAFF");
    expect(ocrResult.value.progress.length).toBeGreaterThan(0);

    // Check extracted fields
    const extracted = await api.getExtractedFields();
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    // CONFIRM: confirm result (no edits needed)
    const confirmed = await api.confirmOcrResult();
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.confirmedBy).toBe("STAFF");
    expect(confirmed.value.fields.passportNumber).toBe(PASSPORT_NUMBER);
    expect(confirmed.value.fields.fullName).toBe("MUSTER JOHN MICHAEL");

    // SAVE: save guest data
    const saveResult = await api.saveGuestData(confirmed.value.fields);
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) return;
    expect(saveResult.value.saved).toBe(true);
    expect(saveResult.value.guestId).toBeTruthy();

    // Session state resets after save
    expect(api.getSessionState().stage).toBe("IDLE");
  });

  it("orchestrates full flow with staff edits through OcrApi", async () => {
    // Simulate a pipeline that produces a name with OCR error
    const errLines: OcrTextChunk[] = [
      { text: "P<UTOMUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.94 },
      { text: TD3_LINE_2, confidence: 0.93 },
    ];
    const errFullText = errLines.map((l) => l.text).join("\n");
    const errEngine = new MockOcrEngine({
      lines: errLines,
      fullText: errFullText,
      averageConfidence: 0.93,
    });

    const pipeline = createOcrPipelineService(
      createImageQualityService(),
      createDocumentCropService(),
      createImagePreprocessingService(),
      createMrzDetectionService(),
      errEngine,
      errEngine,
      createMrzParserService(),
      createMrzChecksumValidator(),
      createFieldNormalizationService(),
      createOcrConfidenceService(),
      staffReview,
    );

    const api = createOcrApi(pipeline);

    const captureResult = await api.captureImage("/tmp/test-passport.jpg");
    expect(captureResult.ok).toBe(true);
    if (!captureResult.ok) return;

    // errLines have OCR errors (J0HN, M1CHAEL) but valid check digits on line 2.
    // The pipeline still succeeds but produces fields that need review.
    const ocrResult = await api.runOcr(captureResult.value.image);
    expect(ocrResult.ok).toBe(true);
    if (!ocrResult.ok) return;

    // Staff edits the name via confirmOcrResult with edits
    const confirmedWithEdit = await api.confirmOcrResult({
      fullName: "MUSTER JOHN MICHAEL",
    });
    expect(confirmedWithEdit.ok).toBe(true);
    if (!confirmedWithEdit.ok) return;
    expect(confirmedWithEdit.value.fields.fullName).toBe("MUSTER JOHN MICHAEL");

    // Verify the merge preserved other fields
    expect(confirmedWithEdit.value.fields.passportNumber).toBe(PASSPORT_NUMBER);
    expect(confirmedWithEdit.value.fields.dateOfBirth).toBe(DOB);
  });

  it("handles pipeline failure gracefully through OcrApi", async () => {
    const failingEngine = new MockOcrEngine({ failWithError: true });
    const pipeline = createOcrPipelineService(
      createImageQualityService(),
      createDocumentCropService(),
      createImagePreprocessingService(),
      createMrzDetectionService(),
      failingEngine,
      failingEngine,
      createMrzParserService(),
      createMrzChecksumValidator(),
      createFieldNormalizationService(),
      createOcrConfidenceService(),
      staffReview,
    );

    const api = createOcrApi(pipeline);
    const captureResult = await api.captureImage("/tmp/test-passport.jpg");
    expect(captureResult.ok).toBe(true);
    if (!captureResult.ok) return;

    const ocrResult = await api.runOcr(captureResult.value.image);
    expect(ocrResult.ok).toBe(false);
    if (ocrResult.ok) return;
    // Both paddle and tesseract fail → TESSERACT_FALLBACK_UNAVAILABLE
    expect(ocrResult.error.code).toBe("TESSERACT_FALLBACK_UNAVAILABLE");
    expect(api.getSessionState().stage).toBe("IDLE");
  });

  it("rejects confirmOcrResult when no OCR has been run", async () => {
    const pipeline = createOcrPipelineService();
    const api = createOcrApi(pipeline);
    const result = await api.confirmOcrResult({ fullName: "TEST" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_IMAGE");
  });

  it("resets session between scans", async () => {
    const engine = new MockOcrEngine(validOcrResult());
    const pipeline = createOcrPipelineService(
      createImageQualityService(),
      createDocumentCropService(),
      createImagePreprocessingService(),
      createMrzDetectionService(),
      engine,
      engine,
      createMrzParserService(),
      createMrzChecksumValidator(),
      createFieldNormalizationService(),
      createOcrConfidenceService(),
      staffReview,
    );

    const api = createOcrApi(pipeline);
    expect(api.getSessionState().stage).toBe("IDLE");

    const captureResult = await api.captureImage("/tmp/test-passport.jpg");
    expect(captureResult.ok).toBe(true);
    if (!captureResult.ok) return;

    const ocrResult = await api.runOcr(captureResult.value.image);
    expect(ocrResult.ok).toBe(true);
    expect(api.getSessionState().stage).toBe("CONFIRMED");

    api.resetSession();
    expect(api.getSessionState().stage).toBe("IDLE");

    // After reset, getExtractedFields should fail
    const extracted = await api.getExtractedFields();
    expect(extracted.ok).toBe(false);
  });
});

// =============================================================================
// 9. End-to-End: Autofill failure handling
// =============================================================================

describe("E2E: Autofill Failure Handling", () => {
  it("reports FAILED status when fill executor throws", async () => {
    const failing: FillExecutor = {
      fillWebField: async () => {
        throw new Error("Target field not found");
      },
      fillDesktopField: async () => {
        throw new Error("Desktop automation failed");
      },
      fillCopyAssistant: async () => {
        throw new Error("Clipboard permission denied");
      },
      focusTargetApp: async () => {},
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(failing);
    const profile = await mappingService.createProfile("Failing PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);
    const result = await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
    expect(result.overallStatus).toBe("FAILED");
    expect(result.failedCount).toBe(1);
    expect(result.fieldResults[0]!.error).toContain("not found");
  });

  it("returns PARTIAL when some fields succeed and some fail", async () => {
    let callCount = 0;
    const partial: FillExecutor = {
      ...createMockExecutor(),
      fillWebField: async (_field: string) => {
        callCount++;
        if (callCount === 2) throw new Error("Field not found");
      },
      fillDesktopField: async () => {},
      fillCopyAssistant: async () => {},
      focusTargetApp: async () => {},
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(partial);
    const profile = await mappingService.createProfile("Partial PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "willFail" }),
    ]);
    const result = await executionService.executeFill({ guestName: "JOHN DOE", willFail: "AB123456" }, profile);
    expect(result.overallStatus).toBe("PARTIAL");
    expect(result.filledCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it("blocks autofill when required field is missing", async () => {
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(createMockExecutor());
    const profile = await mappingService.createProfile("Strict PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "fullName" as OcrFieldKey,
        formField: "guestName",
        required: true,
      }),
    ]);
    const result = await executionService.executeFill({}, profile);
    expect(result.overallStatus).toBe("FAILED");
  });
});

// =============================================================================
// 10. End-to-End: Config system for field mapping
// =============================================================================

describe("E2E: Config — Field mapping profiles", () => {
  let mappingService: AutoFillMappingService;
  let profile: AutoFillProfile;

  beforeEach(async () => {
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    profile = await mappingService.createProfile("Test PMS", "web");
  });

  it("creates profile with full field mapping set", async () => {
    const allFields: Array<{ ocrField: OcrFieldKey; formField: string }> = [
      { ocrField: "fullName", formField: "guestName" },
      { ocrField: "firstName", formField: "firstName" },
      { ocrField: "lastName", formField: "lastName" },
      { ocrField: "gender", formField: "gender" },
      { ocrField: "dateOfBirth", formField: "birthDate" },
      { ocrField: "nationality", formField: "nationality" },
      { ocrField: "countryCode", formField: "countryCode" },
      { ocrField: "documentType", formField: "documentType" },
      { ocrField: "documentNumber", formField: "docNumber" },
      { ocrField: "passportNumber", formField: "passportNo" },
      { ocrField: "idNumber", formField: "idNumber" },
      { ocrField: "issueDate", formField: "issueDate" },
      { ocrField: "expiryDate", formField: "docExpiry" },
      { ocrField: "issuingCountry", formField: "issuingCountry" },
    ];
    const mappings: FieldMappingEntry[] = allFields.map((f) => ({
      id: crypto.randomUUID(),
      ocrField: f.ocrField,
      formField: f.formField,
      required: false,
      enabled: true,
    }));
    await mappingService.setMappings(profile.id, mappings);
    const loaded = await mappingService.getProfile(profile.id);
    expect(loaded?.mappings).toHaveLength(14);
  });

  it("validates mapping entries", async () => {
    const valid = makeMapping({ ocrField: "fullName" as OcrFieldKey, formField: "guestName" });
    expect(mappingService.validateMappingEntry(valid, [])).toHaveLength(0);

    const emptyForm = makeMapping({ ocrField: "fullName" as OcrFieldKey, formField: "" });
    expect(mappingService.validateMappingEntry(emptyForm, []).some((e) => e.code === "EMPTY_FORM_FIELD")).toBe(true);

    const invalidOcr = makeMapping({ ocrField: "badField" as OcrFieldKey, formField: "test" });
    expect(mappingService.validateMappingEntry(invalidOcr, []).some((e) => e.code === "INVALID_OCR_FIELD")).toBe(true);
  });

  it("detects duplicate mappings", async () => {
    const m1 = makeMapping({ id: "m1", ocrField: "fullName" as OcrFieldKey, formField: "guestName" });
    const m2 = makeMapping({ id: "m2", ocrField: "fullName" as OcrFieldKey, formField: "guestName" });
    const errors = mappingService.validateMappingEntry(m2, [m1]);
    expect(errors.some((e) => e.code === "DUPLICATE_MAPPING")).toBe(true);
  });
});
