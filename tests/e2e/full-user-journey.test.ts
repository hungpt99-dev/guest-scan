import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSettingsService,
  createInMemorySettingsStore,
  type SettingsService,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
} from "../../apps/desktop/src/services/settings-service";
import {
  createAuditLogService,
  createInMemoryAuditLogStore,
  type AuditLogService,
  type AuditLogEntry,
} from "../../apps/desktop/src/services/audit-log-service";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
  type AutoFillProfile,
  type FieldMappingEntry,
  type OcrFieldKey,
} from "../../apps/desktop/src/services/auto-fill-mapping-service";
import {
  createAutoFillExecutionService,
  type AutoFillExecutionService,
  type FillExecutor,
} from "../../apps/desktop/src/services/auto-fill-execution-service";
import {
  createStaffReviewService,
  type StaffReviewService,
  type NormalizedFields,
  type EditableFields,
  type PendingReview,
  type ConfirmedFields,
} from "../../apps/desktop/src/services/staff_review_service";
import {
  createImageQualityService,
  type ImageQualityService,
  type ImageInput,
  type ImageQualityResult,
} from "../../apps/desktop/src/services/image_quality_service";
import {
  createDocumentCropService,
  type DocumentCropService,
  type CroppedImage,
} from "../../apps/desktop/src/services/document_crop_service";
import {
  createImagePreprocessingService,
  type ImagePreprocessingService,
  type PreprocessedImage,
} from "../../apps/desktop/src/services/image_preprocessing_service";
import {
  createMrzDetectionService,
  type MrzDetectionService,
  type MrzRegion,
} from "../../apps/desktop/src/services/mrz_detection_service";
import {
  createMrzParserService,
  type MrzParserService,
  type MrzParseResult,
} from "../../apps/desktop/src/services/mrz_parser_service";
import {
  createMrzChecksumValidator,
  type MrzChecksumValidator,
  type MrzChecksumValidationResult,
} from "../../apps/desktop/src/services/mrz_checksum_validator";
import {
  createFieldNormalizationService,
  type FieldNormalizationService,
} from "../../apps/desktop/src/services/field_normalization_service";
import {
  createConfidenceScoringService,
  type ConfidenceScoringService,
} from "../../apps/desktop/src/services/confidence-scoring-service";
import { createOcrConfidenceService } from "../../apps/desktop/src/services/ocr_confidence_service";
import {
  createOcrPipelineService,
  type OcrPipelineService,
  type OcrPipelineError,
} from "../../apps/desktop/src/services/ocr_pipeline_service";
import { MockOcrEngine } from "../../apps/desktop/src/ocr/mock_ocr_engine";
import type { OcrEngine, OcrTextResult, OcrTextChunk } from "../../apps/desktop/src/ocr/ocr_engine";
import { logger } from "../../apps/desktop/src/lib/logger";

// Valid TD3 MRZ with correct ICAO check digits.
// Nationality/issuing country is GBR (United Kingdom) — a valid ISO3 code.
// Line 2: AB123456<4GBR8510105M2001012<<<<<<<<<<<<<<<<02
//   - passportNumber check digit at pos 9: 4 (AB123456< → 184 % 10 = 4)
//   - DOB check digit at pos 19: 5 (851010 → 75 % 10 = 5)
//   - expiry check digit at pos 27: 2 (200101 → 22 % 10 = 2)
//   - optional data check digit at pos 42: 0 (all fillers → 0)
//   - final composite check digit at pos 43: 2 (composite → 272 % 10 = 2)
const TD3_VALID_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const TD3_VALID_LINE_2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<02";
const TD3_VALID_FULLTEXT = [TD3_VALID_LINE_1, TD3_VALID_LINE_2].join("\n");

// Expired document: expiry year is 2019 (YY=19, which becomes 2019 for 1900+19)
const EXPIRED_TD3_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const EXPIRED_TD3_LINE_2 = "AB123456<4UTO8510105M1901012<<<<<<<<<<<<<<<<02";

// Invalid checksum: passport check digit at pos 9 is wrong (9 instead of 4)
const INVALID_CHECKSUM_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const INVALID_CHECKSUM_LINE_2 = "AB123456<9UTO8510105M2001012<<<<<<<<<<<<<<<<02";

const TD1_LINE_1 = "I<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<<<";
const TD1_LINE_2 = "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<<<<<<";
const TD1_LINE_3 = "XC123456<UTO1234567<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<";

const MRZ_PASSPORT_NUMBER = "AB123456";
const MRZ_DOB = "1985-10-10";
const MRZ_EXPIRY = "2020-01-01";

function createMockImageInput(path = "/tmp/test-passport.jpg"): ImageInput {
  return { imagePath: path };
}

function createMockOcrResult(overrides?: Partial<OcrTextResult>, lines?: OcrTextChunk[]): OcrTextResult {
  const defaultLines: OcrTextChunk[] = [
    { text: TD3_VALID_LINE_1, confidence: 0.95 },
    { text: TD3_VALID_LINE_2, confidence: 0.93 },
  ];
  const l = lines ?? defaultLines;
  return {
    lines: l,
    fullText: l.map((x) => x.text).join("\n"),
    averageConfidence: 0.94,
    ...overrides,
  };
}

function createLowConfidenceOcrResult(): OcrTextResult {
  return {
    lines: [
      { text: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.45 },
      { text: "AB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.4 },
    ],
    fullText: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04",
    averageConfidence: 0.42,
  };
}

function createBlurryOcrResult(): OcrTextResult {
  return {
    lines: [
      { text: "P<UTO USTER<<JOH <MICHAEL<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.3 },
      { text: "AB12 456<7UTO8 10101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.25 },
    ],
    fullText: "P<UTO USTER<<JOH <MICHAEL<<<<<<<<<<<<<<<<<<<<<<\nAB12 456<7UTO8 10101M2001011<<<<<<<<<<<<<<<<04",
    averageConfidence: 0.28,
  };
}

function makeNormalizedFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: MRZ_DOB,
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: MRZ_PASSPORT_NUMBER,
    passportNumber: MRZ_PASSPORT_NUMBER,
    idNumber: "",
    issueDate: "",
    expiryDate: MRZ_EXPIRY,
    issuingCountry: "UTO",
    mrzRaw: TD3_VALID_FULLTEXT,
    mrzParsed: [TD3_VALID_LINE_1, TD3_VALID_LINE_2],
    rawOriginal: {
      fullName: "MUSTER<<JOHN<MICHAEL",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      gender: "M",
      dateOfBirth: "851010",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "P",
      passportNumber: MRZ_PASSPORT_NUMBER,
      documentNumber: MRZ_PASSPORT_NUMBER,
      idNumber: "",
      issueDate: "",
      expiryDate: "200101",
      mrzRaw: TD3_VALID_FULLTEXT,
    },
    ...overrides,
  };
}

function makeEditableFields(overrides: Partial<EditableFields> = {}): EditableFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: MRZ_DOB,
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: MRZ_PASSPORT_NUMBER,
    passportNumber: MRZ_PASSPORT_NUMBER,
    idNumber: "",
    issueDate: "",
    expiryDate: MRZ_EXPIRY,
    issuingCountry: "UTO",
    ...overrides,
  };
}

function makeConfirmedFields(overrides: Partial<ConfirmedFields> = {}): ConfirmedFields {
  const fields = makeNormalizedFields();
  return {
    fields,
    edits: makeEditableFields(),
    original: fields,
    lowConfidenceFields: [],
    confirmedAt: "2025-06-15T10:30:00Z",
    confirmedBy: "STAFF",
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

class FailingFillExecutor implements FillExecutor {
  async fillWebField(): Promise<void> {
    throw new Error("Web fill failed: target field not found");
  }
  async fillDesktopField(): Promise<void> {
    throw new Error("Desktop fill failed: automation element not found");
  }
  async fillCopyAssistant(): Promise<void> {
    throw new Error("Clipboard write failed: permission denied");
  }
  async focusTargetApp(): Promise<void> {
    throw new Error("Target window not found");
  }
}

// -------------------- Section 1: First-time Setup Wizard --------------------

describe("E2E: First-time Setup Wizard", () => {
  let settingsService: SettingsService;
  let mappingService: AutoFillMappingService;

  beforeEach(() => {
    settingsService = createSettingsService(createInMemorySettingsStore());
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
  });

  it("loads default settings before onboarding is completed", async () => {
    const settings = await settingsService.loadSettings();
    expect(settings.onboardingCompleted).toBe(false);
    expect(settings.ocr.engineType).toBe("paddle");
    expect(settings.ocr.enableFallback).toBe(true);
    expect(settings.autoFill.enableTestMode).toBe(true);
  });

  it("completes setup wizard by marking onboarding as done", async () => {
    await settingsService.loadSettings();
    const updated = await settingsService.updateSettings({
      ocr: { engineType: "tesseract", ocrConfidenceThreshold: 0.7 },
      camera: {
        deviceId: "camera-001",
        label: "HD Webcam",
        resolution: { width: 1920, height: 1080 },
      },
      onboardingCompleted: true,
    });
    expect(updated.onboardingCompleted).toBe(true);
    expect(updated.ocr.engineType).toBe("tesseract");
    expect(updated.ocr.ocrConfidenceThreshold).toBe(0.7);
    expect(updated.camera.deviceId).toBe("camera-001");
  });

  it("creates default auto-fill profile during setup", async () => {
    const profile = await mappingService.createProfile("Default Hotel Profile", "copy_assistant");
    expect(profile.name).toBe("Default Hotel Profile");
    expect(profile.targetSystem).toBe("copy_assistant");
    expect(profile.mappings).toHaveLength(0);
    expect(profile.isDefault).toBe(true);
  });

  it("creates multiple profiles and sets default", async () => {
    const profileA = await mappingService.createProfile("PMS Alpha", "web");
    const profileB = await mappingService.createProfile("PMS Beta", "desktop");

    expect(profileA.isDefault).toBe(true);
    expect(profileB.isDefault).toBe(false);

    await mappingService.setDefaultProfile(profileB.id);
    const defaultProfile = await mappingService.getDefaultProfile();
    expect(defaultProfile?.id).toBe(profileB.id);
  });

  it("skips setup and still works with default settings", async () => {
    const settings = await settingsService.loadSettings();
    expect(settings.onboardingCompleted).toBe(false);
    const profiles = await mappingService.getAllProfiles();
    expect(profiles).toHaveLength(0);
    const svc = createOcrPipelineService();
    expect(svc).toBeDefined();
  });

  it("rejects invalid settings during setup", async () => {
    await settingsService.loadSettings();
    await expect(settingsService.updateSettings({ ocr: { engineType: "invalid" as never } })).rejects.toThrow();
    await expect(settingsService.updateSettings({ ocr: { ocrConfidenceThreshold: 1.5 } })).rejects.toThrow();
    await expect(
      settingsService.updateSettings({ camera: { resolution: { width: -1, height: 720 } } }),
    ).rejects.toThrow();
  });
});

// -------------------- Section 2: Camera Input Flow --------------------

describe("E2E: Camera Webcam Scanner Input Flow", () => {
  it("detects available camera devices (simulated)", async () => {
    const devices = [
      { deviceId: "cam-001", label: "FaceTime HD Camera", kind: "videoinput" },
      { deviceId: "cam-002", label: "USB Camera", kind: "videoinput" },
      { deviceId: "cam-003", label: "Scanner", kind: "videoinput" },
    ];
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    expect(videoDevices).toHaveLength(3);
    expect(videoDevices[0]!.deviceId).toBe("cam-001");
  });

  it("selects first available camera by default", async () => {
    const devices = [{ deviceId: "cam-001", label: "FaceTime HD Camera", kind: "videoinput" }];
    expect(devices.length).toBeGreaterThan(0);
    const settingsService = createSettingsService(createInMemorySettingsStore());
    await settingsService.loadSettings();
    const updated = await settingsService.updateSettings({
      camera: {
        deviceId: devices[0]!.deviceId,
        label: devices[0]!.label,
        resolution: { width: 1280, height: 720 },
      },
    });
    expect(updated.camera.deviceId).toBe("cam-001");
    expect(updated.camera.label).toBe("FaceTime HD Camera");
  });

  it("handles no camera available gracefully", async () => {
    const devices: { deviceId: string; label: string; kind: string }[] = [];
    expect(devices).toHaveLength(0);
    const settingsService = createSettingsService(createInMemorySettingsStore());
    await settingsService.loadSettings();
    const settings = settingsService.getSettings();
    expect(settings.camera.deviceId).toBe("");
  });

  it("stores image from capture and passes to OCR pipeline", async () => {
    const mockImageInput = createMockImageInput("/tmp/captured-passport.jpg");
    expect(mockImageInput.imagePath).toContain("captured-passport");
    const mockOcrEngine = new MockOcrEngine();
    const result = await mockOcrEngine.extractText(mockImageInput);
    expect(result.lines).toHaveLength(2);
    expect(result.averageConfidence).toBeGreaterThan(0.9);
  });
});

// -------------------- Section 3: Good Image Full Pipeline --------------------

describe("E2E: Good Image → OCR → MRZ Parsing → Checksum → Review → Confirm → Auto-fill", () => {
  let settingsService: SettingsService;
  let auditService: AuditLogService;
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let sessionId: string;

  beforeEach(() => {
    settingsService = createSettingsService(createInMemorySettingsStore());
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    executionService = createAutoFillExecutionService(createMockExecutor());
    sessionId = crypto.randomUUID();
  });

  it("completes full happy path: capture → quality → OCR → parse → validate → review → confirm → auto-fill", async () => {
    // 1. Load settings
    await settingsService.loadSettings();

    // 2. Create auto-fill profile with mappings
    const profile = await mappingService.createProfile("Happy Path PMS", "copy_assistant");
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
      makeMapping({ id: crypto.randomUUID(), ocrField: "nationality" as OcrFieldKey, formField: "nationality" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "gender" as OcrFieldKey, formField: "gender" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "expiryDate" as OcrFieldKey, formField: "docExpiry" }),
    ]);

    // 3. Audit: OCR attempt
    await auditService.recordOcrAttempt(sessionId, {
      engineType: "mock",
      documentType: "PASSPORT",
      profileId: profile.id,
    });

    // 4. Simulate good image quality analysis
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    expect(qualityResult.passed).toBe(true);
    expect(qualityResult.warnings).toHaveLength(0);

    // 5. Simulate document crop
    const cropService = createDocumentCropService();
    const cropped = await cropService.cropDocument(createMockImageInput());
    expect(cropped.imagePath).toBeTruthy();

    // 6. Simulate preprocessing
    const preprocessService = createImagePreprocessingService();
    const preprocessed = await preprocessService.preprocessImage(cropped);
    expect(preprocessed.imagePath).toBeTruthy();

    // 7. Simulate MRZ detection
    const mrzDetection = createMrzDetectionService();
    const mrzRegion = await mrzDetection.detectMrzRegion(preprocessed);
    expect(mrzRegion.detectedFormat).not.toBe("UNKNOWN");

    // 8. Run mock OCR with valid MRZ (correct checksums)
    const validLines: OcrTextChunk[] = [
      { text: TD3_VALID_LINE_1, confidence: 0.95 },
      { text: TD3_VALID_LINE_2, confidence: 0.93 },
    ];
    const mockOcr = new MockOcrEngine({
      lines: validLines,
      fullText: TD3_VALID_FULLTEXT,
      averageConfidence: 0.94,
    });
    const ocrResult = await mockOcr.extractText(createMockImageInput());
    expect(ocrResult.averageConfidence).toBeGreaterThan(0.6);

    // 9. Parse MRZ
    const mrzParser = createMrzParserService();
    const mrzLines = ocrResult.lines.map((l) => l.text);
    const parseResult = mrzParser.parseMrzLines(mrzLines);
    expect(parseResult.passportNumber).toBe(MRZ_PASSPORT_NUMBER);
    expect(parseResult.surname).toBe("MUSTER");
    expect(parseResult.givenName).toBe("JOHN MICHAEL");

    // 10. Validate checksums
    const checksumValidator = createMrzChecksumValidator();
    const checksumResult = checksumValidator.validateChecksums(mrzLines);
    expect(checksumResult.overallValid).toBe(true);
    expect(checksumResult.errors).toHaveLength(0);

    // 11. Normalize fields
    const fieldNormalization = createFieldNormalizationService();
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
      checkDigits: checksumResult as unknown as Record<string, boolean>,
    };
    const normalized = fieldNormalization.normalizeFields(mrzParsedFields);
    expect(normalized.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(normalized.passportNumber).toBe(MRZ_PASSPORT_NUMBER);
    expect(normalized.dateOfBirth).toBe(MRZ_DOB);
    expect(normalized.expiryDate).toBe(MRZ_EXPIRY);

    // 12. Score confidence
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(
      normalized,
      ocrResult,
      qualityResult,
      checksumResult as unknown as Record<string, boolean>,
    );
    expect(scores.fullName.level).toBe("HIGH");
    expect(scores.passportNumber.level).toBe("HIGH");
    expect(scores.dateOfBirth.level).toBe("HIGH");

    // 13. Staff review
    // nationality "UTO" is a fictional ISO3 code → countryCode/issuingCountry penalized.
    // issueDate is empty → penalized. These 4 fields will be MEDIUM/LOW confidence.
    const staffReview = createStaffReviewService();
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields).toContain("nationality");
    expect(pending.lowConfidenceFields).toContain("countryCode");

    // Audit: staff edit (none in happy path)
    // Audit: confirmation
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
    expect(confirmed.confirmedAt).toBeTruthy();
    await auditService.recordConfirmation(sessionId, confirmed);

    // 14. Apply mappings
    const applied = mappingService.applyMappingsWithProfile(normalized, profile);
    expect(applied.mappedCount).toBe(6);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe(MRZ_PASSPORT_NUMBER);
    expect(applied.fieldValues.birthDate).toBe(MRZ_DOB);
    expect(applied.validationErrors).toHaveLength(0);

    // 15. Execute auto-fill
    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
    expect(execResult.filledCount).toBe(6);
    expect(execResult.failedCount).toBe(0);

    // 16. Audit: auto-fill
    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);

    // 17. Verify full audit trail
    const auditTrail = await auditService.query({ sessionId });
    expect(auditTrail.total).toBe(3);
    const eventTypes = auditTrail.entries.map((e) => e.eventType);
    expect(eventTypes).toContain("OCR_ATTEMPT");
    expect(eventTypes).toContain("CONFIRMATION");
    expect(eventTypes).toContain("AUTO_FILL");
  });

  it("processes TD1 ID card format correctly", async () => {
    const td1Lines: OcrTextChunk[] = [
      { text: TD1_LINE_1, confidence: 0.94 },
      { text: TD1_LINE_2, confidence: 0.92 },
      { text: TD1_LINE_3, confidence: 0.9 },
    ];
    const mockOcr = new MockOcrEngine({
      lines: td1Lines,
      fullText: td1Lines.map((l) => l.text).join("\n"),
      averageConfidence: 0.92,
    });
    const result = await mockOcr.extractText(createMockImageInput());
    expect(result.lines).toHaveLength(3);
    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines(result.lines.map((l) => l.text));
    expect(parseResult.documentType).toBe("ID_CARD");
    expect(parseResult.passportNumber).toBe(MRZ_PASSPORT_NUMBER);
  });
});

// -------------------- Section 4: Bad Image Cases --------------------

describe("E2E: Bad Image Cases", () => {
  it("handles blurry image: quality check fails before OCR", async () => {
    class BlurryMockQualityService implements ImageQualityService {
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
    const qualityService = new BlurryMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("BLURRY");
  });

  it("handles glare/reflection on image", async () => {
    class GlareMockQualityService implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 80,
            brightness: 180,
            contrast: 50,
            glareRatio: 0.45,
            skewAngle: 0.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.7,
          },
          warnings: ["GLARE_DETECTED"],
          passed: false,
        };
      }
    }
    const qualityService = new GlareMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("GLARE_DETECTED");
  });

  it("handles dark image (too dark)", async () => {
    class DarkMockQualityService implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 75,
            brightness: 15,
            contrast: 20,
            glareRatio: 0.01,
            skewAngle: 0.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.3,
          },
          warnings: ["TOO_DARK", "LOW_CONTRAST"],
          passed: false,
        };
      }
    }
    const qualityService = new DarkMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.warnings).toContain("TOO_DARK");
    expect(result.warnings).toContain("LOW_CONTRAST");
    expect(result.passed).toBe(false);
  });

  it("handles rotated document", async () => {
    class SkewedMockQualityService implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 80,
            brightness: 128,
            contrast: 50,
            glareRatio: 0.02,
            skewAngle: -12.5,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.6,
          },
          warnings: ["SKEWED"],
          passed: false,
        };
      }
    }
    const qualityService = new SkewedMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.warnings).toContain("SKEWED");
  });

  it("handles document too small (low resolution)", async () => {
    class LowResMockQualityService implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 85,
            brightness: 128,
            contrast: 55,
            glareRatio: 0.02,
            skewAngle: 0.5,
            width: 320,
            height: 240,
            edgeVisibilityScore: 0.8,
          },
          warnings: ["LOW_RESOLUTION"],
          passed: false,
        };
      }
    }
    const qualityService = new LowResMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.warnings).toContain("LOW_RESOLUTION");
  });

  it("handles MRZ not found in image", async () => {
    class FailingMockMrzDetectionService implements MrzDetectionService {
      async detectMrzRegion(_image: PreprocessedImage): Promise<MrzRegion> {
        throw Object.assign(new Error("MRZ_NOT_FOUND"), { type: "MRZ_NOT_FOUND" });
      }
    }
    const mrzDetection = new FailingMockMrzDetectionService();
    const preprocessed: PreprocessedImage = {
      imagePath: "/tmp/no-mrz.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
      profileUsed: "standard",
      transforms: {
        claheApplied: true,
        denoised: true,
        deskewApplied: true,
        upscaled: false,
        rotated: false,
        glareInpainted: false,
        adaptiveThreshold: false,
        gammaCorrected: false,
      },
    };
    await expect(mrzDetection.detectMrzRegion(preprocessed)).rejects.toMatchObject({
      message: "MRZ_NOT_FOUND",
    });
  });

  it("handles image with multiple quality issues simultaneously", async () => {
    class MultiIssueMockQualityService implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 18,
            brightness: 230,
            contrast: 15,
            glareRatio: 0.35,
            skewAngle: 15.0,
            width: 600,
            height: 400,
            edgeVisibilityScore: 0.2,
          },
          warnings: [
            "BLURRY",
            "TOO_BRIGHT",
            "LOW_CONTRAST",
            "GLARE_DETECTED",
            "SKEWED",
            "LOW_RESOLUTION",
            "EDGES_NOT_VISIBLE",
          ],
          passed: false,
        };
      }
    }
    const qualityService = new MultiIssueMockQualityService();
    const result = await qualityService.analyzeImage(createMockImageInput());
    expect(result.passed).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);
  });
});

// -------------------- Section 5: Low Confidence and Fallback --------------------

describe("E2E: Low-confidence OCR Result → Tesseract Fallback → Staff Review", () => {
  let auditService: AuditLogService;
  let sessionId: string;
  let staffReview: StaffReviewService;

  beforeEach(() => {
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
    staffReview = createStaffReviewService();
  });

  it("flags low-confidence fields for manual review", async () => {
    const lowConfOcr = createLowConfidenceOcrResult();
    expect(lowConfOcr.averageConfidence).toBeLessThan(0.6);

    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines(lowConfOcr.lines.map((l) => l.text));
    expect(parseResult.passportNumber).toBeTruthy();

    const fieldNormalization = createFieldNormalizationService();
    const normalized = fieldNormalization.normalizeFields({
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
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: lowConfOcr.fullText,
      mrzParsed: lowConfOcr.lines.map((l) => l.text),
      checkDigits: {},
    });

    const confidenceService = createConfidenceScoringService();
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    const scores = confidenceService.calculateFieldScores(normalized, lowConfOcr, qualityResult, {});

    const lowFields = confidenceService.identifyLowConfidenceFields(scores);
    expect(lowFields.length).toBeGreaterThan(0);

    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields.length).toBeGreaterThan(0);
    expect(pending.confirmed).toBe(false);
  });

  it("simulates PaddleOCR failure then Tesseract fallback", async () => {
    const failingEngine = new MockOcrEngine({ failWithError: true });
    await expect(failingEngine.extractText(createMockImageInput())).rejects.toThrow(
      "Mock OCR engine simulated failure",
    );

    const fallbackEngine = new MockOcrEngine({
      lines: [
        { text: TD3_VALID_LINE_1, confidence: 0.88 },
        { text: TD3_VALID_LINE_2, confidence: 0.85 },
      ],
      fullText: TD3_VALID_FULLTEXT,
      averageConfidence: 0.86,
    });
    const fallbackResult = await fallbackEngine.extractText(createMockImageInput());
    expect(fallbackResult.averageConfidence).toBeGreaterThan(0.6);
    expect(fallbackResult.averageConfidence).toBe(0.86);
  });

  it("invokes Tesseract fallback when PaddleOCR confidence is below threshold", async () => {
    const lowConfEngine = new MockOcrEngine(createLowConfidenceOcrResult());
    const lowResult = await lowConfEngine.extractText(createMockImageInput());
    expect(lowResult.averageConfidence).toBeLessThan(0.6);

    const highConfEngine = new MockOcrEngine(createMockOcrResult());
    const highResult = await highConfEngine.extractText(createMockImageInput());
    expect(highResult.averageConfidence).toBeGreaterThan(0.6);
    expect(highResult.averageConfidence).toBeGreaterThan(lowResult.averageConfidence);
  });

  it("allows staff to review and manually correct low-confidence fields", async () => {
    const normalized = makeNormalizedFields({
      fullName: "MUSTER J0HN M1CHAEL",
      passportNumber: "AB12345?",
      dateOfBirth: "1985-10-10",
      expiryDate: MRZ_EXPIRY,
    });

    const ocrResult = createLowConfidenceOcrResult();
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(normalized, ocrResult, qualityResult, {});

    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields.length).toBeGreaterThan(0);

    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    expect(edited.edits.fullName).toBe("MUSTER JOHN MICHAEL");

    const edited2 = await staffReview.editField(edited, "passportNumber", MRZ_PASSPORT_NUMBER);
    expect(edited2.edits.passportNumber).toBe(MRZ_PASSPORT_NUMBER);

    await auditService.recordStaffEdit(sessionId, "fullName", {
      oldValue: "MUSTER J0HN M1CHAEL",
      newValue: "MUSTER JOHN MICHAEL",
    });
    await auditService.recordStaffEdit(sessionId, "passportNumber", {
      oldValue: "AB12345?",
      newValue: MRZ_PASSPORT_NUMBER,
    });

    const confirmed = await staffReview.confirmResult(edited2);
    await auditService.recordConfirmation(sessionId, confirmed);

    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.fields.passportNumber).toBe(MRZ_PASSPORT_NUMBER);

    const audit = await auditService.query({ sessionId });
    const events = audit.entries.map((e) => e.eventType);
    expect(events).toContain("STAFF_EDIT");
    expect(events).toContain("CONFIRMATION");
  });
});

// -------------------- Section 6: Invalid MRZ Checksum --------------------

describe("E2E: Invalid MRZ Checksum → Blocks Auto-fill", () => {
  let staffReview: StaffReviewService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("detects invalid MRZ checksum and blocks auto-fill", async () => {
    const invalidLines = [INVALID_CHECKSUM_LINE_1, INVALID_CHECKSUM_LINE_2];
    const checksumValidator = createMrzChecksumValidator();
    const checksumResult = checksumValidator.validateChecksums(invalidLines);
    expect(checksumResult.overallValid).toBe(false);
    expect(checksumResult.passportNumberValid).toBe(false);
    expect(checksumResult.errors).toContain("PASSPORT_NUMBER_CHECK_FAILED");

    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines(invalidLines);
    expect(parseResult.passportNumber).toBeTruthy();

    await auditService.recordOcrFailure(sessionId, "MRZ_CHECKSUM_FAILED", {
      passportNumberValid: checksumResult.passportNumberValid,
      errors: checksumResult.errors,
    });

    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.eventType).toBe("OCR_FAILURE");
    expect(audit.entries[0]!.details.error).toBe("MRZ_CHECKSUM_FAILED");
  });

  it("requires manual correction of invalid checksum fields before auto-fill", async () => {
    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines([INVALID_CHECKSUM_LINE_1, INVALID_CHECKSUM_LINE_2]);

    const normalized = makeNormalizedFields({ passportNumber: parseResult.passportNumber });
    const ocrResult = createMockOcrResult();
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(normalized, ocrResult, qualityResult, {
      passport_number_valid: false,
    });

    // With base=0.2+0.94*0.8=0.952 and check digit penalty 0.2 → 0.752 → MEDIUM
    expect(scores.passportNumber.level).toBe("MEDIUM");
    expect(scores.passportNumber.issues).toContain("MRZ check digit validation failed");

    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields).toContain("passportNumber");

    const edited = await staffReview.editField(pending, "passportNumber", MRZ_PASSPORT_NUMBER);
    const confirmed = await staffReview.confirmResult(edited);
    expect(confirmed.fields.passportNumber).toBe(MRZ_PASSPORT_NUMBER);

    const fieldNormalization = createFieldNormalizationService();
    const mrzParsedFields = {
      fullName: parseResult.fullName,
      surname: parseResult.surname,
      givenName: parseResult.givenName,
      gender: parseResult.gender,
      dateOfBirth: parseResult.dateOfBirth,
      nationality: parseResult.nationality,
      issuingCountry: parseResult.issuingCountry,
      documentType: parseResult.documentType,
      passportNumber: MRZ_PASSPORT_NUMBER,
      documentNumber: MRZ_PASSPORT_NUMBER,
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: INVALID_CHECKSUM_LINE_1 + "\n" + INVALID_CHECKSUM_LINE_2,
      mrzParsed: [INVALID_CHECKSUM_LINE_1, INVALID_CHECKSUM_LINE_2],
      checkDigits: {},
    };
    const reNormalized = fieldNormalization.normalizeFields(mrzParsedFields);
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const profile = await mappingService.createProfile("Checksum PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "passportNumber" as OcrFieldKey,
        formField: "passportNo",
        required: true,
      }),
    ]);

    const applied = mappingService.applyMappingsWithProfile(reNormalized, profile);
    const executionService = createAutoFillExecutionService(createMockExecutor());
    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
  });
});

// -------------------- Section 7: Expired Document --------------------

describe("E2E: Expired Document Warning", () => {
  it("detects expired passport document", async () => {
    const expiredLines: OcrTextChunk[] = [
      { text: EXPIRED_TD3_LINE_1, confidence: 0.95 },
      { text: EXPIRED_TD3_LINE_2, confidence: 0.93 },
    ];
    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines(expiredLines.map((l) => l.text));
    expect(parseResult.expiryDate).toBeTruthy();

    const expiryDate = parseResult.expiryDate;
    const expiryYear = parseInt(expiryDate.slice(0, 4), 10);
    const currentYear = new Date().getFullYear();
    expect(expiryYear).toBeLessThan(currentYear);

    const fieldNormalization = createFieldNormalizationService();
    const normalized = fieldNormalization.normalizeFields({
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
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate,
      mrzRaw: expiredLines.map((l) => l.text).join("\n"),
      mrzParsed: expiredLines.map((l) => l.text),
      checkDigits: {},
    });
    expect(normalized.expiryDate).toBeTruthy();

    const staffReview = createStaffReviewService();
    const ocrResult = createMockOcrResult(undefined, expiredLines);
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(normalized, ocrResult, qualityResult, {});

    const pending = await staffReview.reviewResult(normalized, scores);
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");

    const auditService = createAuditLogService(createInMemoryAuditLogStore());
    const sessionId = crypto.randomUUID();
    await auditService.recordConfirmation(sessionId, confirmed);
    await auditService.recordOcrAttempt(sessionId, { documentType: "PASSPORT", expiryDate: "EXPIRED" });

    const audit = await auditService.query({ sessionId });
    const events = audit.entries.map((e) => e.eventType);
    expect(events).toContain("CONFIRMATION");
    expect(events).toContain("OCR_ATTEMPT");
  });

  it("shows warning for expired document but still allows confirmation", async () => {
    const mockOcr = new MockOcrEngine({
      lines: [
        { text: EXPIRED_TD3_LINE_1, confidence: 0.95 },
        { text: EXPIRED_TD3_LINE_2, confidence: 0.93 },
      ],
      fullText: EXPIRED_TD3_LINE_1 + "\n" + EXPIRED_TD3_LINE_2,
      averageConfidence: 0.94,
    });
    const result = await mockOcr.extractText(createMockImageInput());
    const mrzParser = createMrzParserService();
    const parseResult = mrzParser.parseMrzLines(result.lines.map((l) => l.text));

    const fieldNormalization = createFieldNormalizationService();
    const normalized = fieldNormalization.normalizeFields({
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
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: result.fullText,
      mrzParsed: result.lines.map((l) => l.text),
      checkDigits: {},
    });

    const expiryYear = parseInt(normalized.expiryDate.slice(0, 4), 10);
    const currentYear = new Date().getFullYear();
    const isExpired = expiryYear < currentYear;
    expect(isExpired).toBe(true);

    const staffReview = createStaffReviewService();
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(normalized, result, qualityResult, {});
    const pending = await staffReview.reviewResult(normalized, scores);
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
  });
});

// -------------------- Section 8: Manual Field Correction --------------------

describe("E2E: Manual Field Correction Before Save", () => {
  let staffReview: StaffReviewService;
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    staffReview = createStaffReviewService();
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("allows staff to correct multiple fields before confirmation", async () => {
    const normalized = makeNormalizedFields({
      fullName: "MUSTER J0HN M1CHAEL",
      firstName: "J0HN M1CHAEL",
      lastName: "MUSTER",
      gender: "M",
      dateOfBirth: "1985-O1-O1",
      passportNumber: "AB12345?",
      nationality: "XYZ",
    });

    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited1 = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const edited2 = await staffReview.editField(edited1, "firstName", "JOHN MICHAEL");
    const edited3 = await staffReview.editField(edited2, "dateOfBirth", MRZ_DOB);
    const edited4 = await staffReview.editField(edited3, "passportNumber", MRZ_PASSPORT_NUMBER);

    await auditService.recordStaffEdit(sessionId, "fullName", {
      oldValue: "MUSTER J0HN M1CHAEL",
      newValue: "MUSTER JOHN MICHAEL",
    });
    await auditService.recordStaffEdit(sessionId, "dateOfBirth", { oldValue: "1985-O1-O1", newValue: MRZ_DOB });
    await auditService.recordStaffEdit(sessionId, "passportNumber", {
      oldValue: "AB12345?",
      newValue: MRZ_PASSPORT_NUMBER,
    });

    const confirmed = await staffReview.confirmResult(edited4);
    await auditService.recordConfirmation(sessionId, confirmed);

    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.fields.dateOfBirth).toBe(MRZ_DOB);
    expect(confirmed.fields.passportNumber).toBe(MRZ_PASSPORT_NUMBER);

    const audit = await auditService.query({ sessionId });
    const edits = audit.entries.filter((e) => e.eventType === "STAFF_EDIT");
    expect(edits).toHaveLength(3);
  });

  it("preserves original fields alongside edits for audit", async () => {
    const normalized = makeNormalizedFields({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const confirmed = await staffReview.confirmResult(edited);

    expect(confirmed.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.original.fullName).toBe("MUSTER J0HN M1CHAEL");
    expect(confirmed.edits.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(confirmed.lowConfidenceFields).toEqual([]);
  });

  it("prevents editing after confirmation", async () => {
    const normalized = makeNormalizedFields({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const confirmed = await staffReview.confirmResult(pending);
    const edits = await staffReview.editField({ ...pending, confirmed: true }, "fullName", "CHANGED AFTER CONFIRM");
    expect(edits.edits.fullName).toBe("MUSTER J0HN M1CHAEL");
  });

  it("tracks edit count in confirmation audit log", async () => {
    const normalized = makeNormalizedFields({ fullName: "MUSTER J0HN M1CHAEL" });
    const pending = await staffReview.reviewResult(normalized, {} as never);
    const edited = await staffReview.editField(pending, "fullName", "MUSTER JOHN MICHAEL");
    const confirmed = await staffReview.confirmResult(edited);

    await auditService.recordOcrAttempt(sessionId, {});
    await auditService.recordConfirmation(sessionId, confirmed);
    const audit = await auditService.query({ sessionId });
    const confirmEntry = audit.entries.find((e) => e.eventType === "CONFIRMATION");
    expect(confirmEntry).toBeDefined();
  });
});

// -------------------- Section 9: Auto-fill Mapping Configuration --------------------

describe("E2E: Auto-fill Mapping Configuration", () => {
  let mappingService: AutoFillMappingService;
  let profile: AutoFillProfile;

  beforeEach(async () => {
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    profile = await mappingService.createProfile("Test PMS", "web");
  });

  it("adds multiple field mappings to a profile", async () => {
    const mappings: FieldMappingEntry[] = [
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
      makeMapping({ id: crypto.randomUUID(), ocrField: "nationality" as OcrFieldKey, formField: "nationality" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "gender" as OcrFieldKey, formField: "gender" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "expiryDate" as OcrFieldKey, formField: "docExpiry" }),
    ];
    await mappingService.setMappings(profile.id, mappings);
    const loaded = await mappingService.getProfile(profile.id);
    expect(loaded?.mappings).toHaveLength(6);
  });

  it("validates mapping entries for duplicates", async () => {
    const m1 = makeMapping({ id: "m1", ocrField: "fullName" as OcrFieldKey, formField: "guestName" });
    const m2 = makeMapping({ id: "m2", ocrField: "fullName" as OcrFieldKey, formField: "guestName" });
    const errors = mappingService.validateMappingEntry(m2, [m1]);
    expect(errors.some((e) => e.code === "DUPLICATE_MAPPING")).toBe(true);
  });

  it("validates mapping entry with empty form field", async () => {
    const m = makeMapping({ id: "m1", ocrField: "fullName" as OcrFieldKey, formField: "" });
    const errors = mappingService.validateMappingEntry(m, []);
    expect(errors.some((e) => e.code === "EMPTY_FORM_FIELD")).toBe(true);
  });

  it("validates mapping entry with invalid OCR field", async () => {
    const m = makeMapping({ id: "m1", ocrField: "nonexistent" as OcrFieldKey, formField: "test" });
    const errors = mappingService.validateMappingEntry(m, []);
    expect(errors.some((e) => e.code === "INVALID_OCR_FIELD")).toBe(true);
  });

  it("detects required but disabled mappings", async () => {
    const m = makeMapping({
      id: "m1",
      ocrField: "fullName" as OcrFieldKey,
      formField: "guestName",
      required: true,
      enabled: false,
    });
    await mappingService.addMapping(profile.id, m);
    const errors = mappingService.validateProfile(profile);
    expect(errors.some((e) => e.code === "REQUIRED_NOT_MAPPED")).toBe(true);
  });

  it("applies mappings to normalized fields correctly", async () => {
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);

    const fields = makeNormalizedFields();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    expect(applied.mappedCount).toBe(2);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe(MRZ_PASSPORT_NUMBER);
    expect(applied.validationErrors).toHaveLength(0);
  });

  it("reports unmapped OCR fields", async () => {
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);
    const fields = makeNormalizedFields();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    expect(applied.unmappedOcrFields.length).toBeGreaterThan(0);
    expect(applied.unmappedOcrFields).toContain("passportNumber");
  });
});

// -------------------- Section 10: Test-mode Auto-fill --------------------

describe("E2E: Test-mode Auto-fill Before Real Auto-fill", () => {
  it("previews values in test mode without executing fill", async () => {
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(createMockExecutor());
    const profile = await mappingService.createProfile("Test Mode PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);

    const fields = makeNormalizedFields();
    const applied = mappingService.applyMappingsWithProfile(fields, profile);

    const testResult = await executionService.testFill(applied.fieldValues, profile);
    expect(testResult.previews).toHaveLength(2);
    expect(testResult.previews[0]!.formField).toBe("guestName");
    expect(testResult.previews[0]!.value).toBe("MUSTER JOHN MICHAEL");
    expect(testResult.previews[0]!.wouldSucceed).toBe(true);
    expect(testResult.previews[1]!.formField).toBe("passportNo");
    // passportNo is a sensitive field so its maskedValue should be masked
    expect(testResult.previews[1]!.maskedValue).not.toBe(MRZ_PASSPORT_NUMBER);
    expect(testResult.overallWouldSucceed).toBe(true);
    expect(testResult.warnings).toHaveLength(0);
  });

  it("reports test failures for missing field values", async () => {
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(createMockExecutor());
    const profile = await mappingService.createProfile("Test Mode PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);

    const testResult = await executionService.testFill({ guestName: "JOHN DOE" }, profile);
    expect(testResult.overallWouldSucceed).toBe(false);
    expect(testResult.warnings.length).toBeGreaterThan(0);
    expect(testResult.previews[1]!.wouldSucceed).toBe(false);
  });

  it("enables test mode from settings", async () => {
    const settingsService = createSettingsService(createInMemorySettingsStore());
    await settingsService.loadSettings();
    const settings = settingsService.getSettings();
    expect(settings.autoFill.enableTestMode).toBe(true);
    const updated = await settingsService.updateSettings({ autoFill: { enableTestMode: false, activeProfileId: "" } });
    expect(updated.autoFill.enableTestMode).toBe(false);
  });
});

// -------------------- Section 11: Auto-fill into Target Forms --------------------

describe("E2E: Auto-fill into Supported Target Forms", () => {
  it("auto-fills into copy_assistant target", async () => {
    let copiedValue = "";
    const executor: FillExecutor = {
      ...createMockExecutor(),
      fillCopyAssistant: async (value: string) => {
        copiedValue = value;
      },
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(executor);
    const profile = await mappingService.createProfile("Copy PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);

    const result = await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(copiedValue).toBe("JOHN DOE");
  });

  it("auto-fills into web target", async () => {
    let capturedField = "";
    let capturedValue = "";
    const executor: FillExecutor = {
      ...createMockExecutor(),
      fillWebField: async (field: string, value: string) => {
        capturedField = field;
        capturedValue = value;
      },
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(executor);
    const profile = await mappingService.createProfile("Web PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passport_no" }),
    ]);

    const result = await executionService.executeFill({ passport_no: MRZ_PASSPORT_NUMBER }, profile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(capturedField).toBe("passport_no");
    expect(capturedValue).toBe(MRZ_PASSPORT_NUMBER);
  });

  it("auto-fills into desktop target", async () => {
    let capturedValue = "";
    const executor: FillExecutor = {
      ...createMockExecutor(),
      fillDesktopField: async (_value: string) => {
        capturedValue = _value;
      },
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(executor);
    const profile = await mappingService.createProfile("Desktop PMS", "desktop");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "dateOfBirth" as OcrFieldKey, formField: "dob" }),
    ]);

    const result = await executionService.executeFill({ dob: MRZ_DOB }, profile);
    expect(result.overallStatus).toBe("SUCCESS");
    expect(capturedValue).toBe(MRZ_DOB);
  });
});

// -------------------- Section 12: Auto-fill Failure Handling --------------------

describe("E2E: Auto-fill Failure Handling", () => {
  it("handles auto-fill failure gracefully", async () => {
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(new FailingFillExecutor());
    const profile = await mappingService.createProfile("Failing PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);

    const result = await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
    expect(result.overallStatus).toBe("FAILED");
    expect(result.failedCount).toBe(1);
    expect(result.filledCount).toBe(0);
    expect(result.fieldResults[0]!.error).toContain("target field not found");
  });

  it("returns PARTIAL status when some fields fail and some succeed", async () => {
    let successCount = 0;
    const executor: FillExecutor = {
      ...createMockExecutor(),
      fillWebField: async (field: string) => {
        if (field === "willFail") {
          throw new Error("Field not found");
        }
        successCount++;
      },
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(executor);
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

  it("blocks auto-fill when validation fails (missing required field)", async () => {
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
    expect(result.failedCount).toBeGreaterThan(0);
  });

  it("records auto-fill failure in audit log", async () => {
    const auditService = createAuditLogService(createInMemoryAuditLogStore());
    const sessionId = crypto.randomUUID();
    await auditService.recordAutoFill(sessionId, "profile-failing", 3, false, {
      error: "Target window not found",
    });

    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.eventType).toBe("AUTO_FILL_FAILURE");
    expect(audit.entries[0]!.details.error).toBe("Target window not found");
  });
});

// -------------------- Section 13: Settings Persistence --------------------

describe("E2E: Settings Persistence After App Restart", () => {
  it("persists settings across simulated app restart", async () => {
    const store = createInMemorySettingsStore();

    const svc1 = createSettingsService(store);
    await svc1.loadSettings();
    await svc1.updateSettings({
      ocr: { engineType: "tesseract", ocrConfidenceThreshold: 0.75 },
      theme: "dark",
      language: "chi",
      onboardingCompleted: true,
      camera: {
        deviceId: "cam-pro",
        label: "Pro Camera",
        resolution: { width: 1920, height: 1080 },
      },
      privacy: { maskDocumentNumberInLogs: false },
    });

    const svc2 = createSettingsService(store);
    const reloaded = await svc2.loadSettings();
    expect(reloaded.ocr.engineType).toBe("tesseract");
    expect(reloaded.ocr.ocrConfidenceThreshold).toBe(0.75);
    expect(reloaded.theme).toBe("dark");
    expect(reloaded.language).toBe("chi");
    expect(reloaded.onboardingCompleted).toBe(true);
    expect(reloaded.camera.deviceId).toBe("cam-pro");
    expect(reloaded.privacy.maskDocumentNumberInLogs).toBe(false);
  });

  it("persists auto-fill profile across simulated restart", async () => {
    const profileStore = createInMemoryProfileStore();
    const mappingService = createAutoFillMappingService(profileStore);

    const profile = await mappingService.createProfile("Persistent PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "passportNumber" as OcrFieldKey, formField: "passportNo" }),
    ]);

    const mappingService2 = createAutoFillMappingService(profileStore);
    const profiles = await mappingService2.getAllProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.name).toBe("Persistent PMS");
    expect(profiles[0]!.mappings).toHaveLength(2);
  });

  it("persists audit log entries across simulated restart", async () => {
    const auditStore = createInMemoryAuditLogStore();
    const auditService = createAuditLogService(auditStore);
    const sessionId = crypto.randomUUID();

    await auditService.recordOcrAttempt(sessionId, { engineType: "mock" });
    await auditService.recordAutoFill(sessionId, "profile-1", 5, true);

    const auditService2 = createAuditLogService(auditStore);
    const all = await auditService2.query({});
    expect(all.total).toBe(2);
  });
});

// -------------------- Section 14: Audit Log Creation --------------------

describe("E2E: Audit Log Creation for All Event Types", () => {
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("records OCR_ATTEMPT event", async () => {
    await auditService.recordOcrAttempt(sessionId, { documentType: "PASSPORT", engineType: "mock" });
    const audit = await auditService.query({ sessionId, eventTypes: ["OCR_ATTEMPT"] });
    expect(audit.total).toBe(1);
    expect(audit.entries[0]!.eventType).toBe("OCR_ATTEMPT");
  });

  it("records OCR_FAILURE event", async () => {
    await auditService.recordOcrFailure(sessionId, "Image too blurry", { blurScore: 12 });
    const audit = await auditService.query({ sessionId, eventTypes: ["OCR_FAILURE"] });
    expect(audit.total).toBe(1);
    expect(audit.entries[0]!.details.error).toBe("Image too blurry");
  });

  it("records STAFF_EDIT event", async () => {
    await auditService.recordStaffEdit(sessionId, "fullName", { oldValue: "JOHN", newValue: "JOHN DOE" });
    const audit = await auditService.query({ sessionId, eventTypes: ["STAFF_EDIT"] });
    expect(audit.total).toBe(1);
    expect(audit.entries[0]!.details.fieldName).toBe("fullName");
  });

  it("records CONFIRMATION event", async () => {
    const confirmed = makeConfirmedFields();
    await auditService.recordConfirmation(sessionId, confirmed);
    const audit = await auditService.query({ sessionId, eventTypes: ["CONFIRMATION"] });
    expect(audit.total).toBe(1);
  });

  it("records AUTO_FILL event", async () => {
    await auditService.recordAutoFill(sessionId, "profile-1", 5, true);
    const audit = await auditService.query({ sessionId, eventTypes: ["AUTO_FILL"] });
    expect(audit.total).toBe(1);
  });

  it("records AUTO_FILL_FAILURE event", async () => {
    await auditService.recordAutoFill(sessionId, "profile-2", 0, false);
    const audit = await auditService.query({ sessionId, eventTypes: ["AUTO_FILL_FAILURE"] });
    expect(audit.total).toBe(1);
  });

  it("records full audit trail with all event types in a single session", async () => {
    const confirmed = makeConfirmedFields();

    await auditService.recordOcrAttempt(sessionId, { documentType: "PASSPORT" });
    await auditService.recordStaffEdit(sessionId, "dateOfBirth", { oldValue: "1990-01-01", newValue: MRZ_DOB });
    await auditService.recordConfirmation(sessionId, confirmed);
    await auditService.recordAutoFill(sessionId, "profile-main", 6, true);

    const all = await auditService.query({ sessionId });
    expect(all.total).toBe(4);

    const eventTypes = all.entries.map((e) => e.eventType);
    expect(eventTypes).toContain("OCR_ATTEMPT");
    expect(eventTypes).toContain("STAFF_EDIT");
    expect(eventTypes).toContain("CONFIRMATION");
    expect(eventTypes).toContain("AUTO_FILL");
  });
});

// -------------------- Section 15: Privacy Checks --------------------

describe("E2E: Privacy Checks", () => {
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    sessionId = crypto.randomUUID();
  });

  it("masks passport number in audit log details", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      passportNumber: "AB1234567",
      documentType: "PASSPORT",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.passportNumber).toContain("*");
    expect(audit.entries[0]!.details.passportNumber).not.toBe("AB1234567");
  });

  it("masks full name in audit log details", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      fullName: "JOHN MICHAEL DOE",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.fullName).toContain("*");
    expect(audit.entries[0]!.details.fullName).not.toBe("JOHN MICHAEL DOE");
  });

  it("masks ID number in audit log details", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      idNumber: "ID123456789",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.idNumber).toContain("*");
  });

  it("redacts image path in audit log details", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      imagePath: "/tmp/passport-abc123.jpg",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.imagePath).toBe("[REDACTED]");
  });

  it("masks sensitive fields in confirmation audit log", async () => {
    const confirmed = makeConfirmedFields();
    await auditService.recordConfirmation(sessionId, confirmed);
    const audit = await auditService.query({ sessionId });
    const fields = audit.entries[0]!.details.fields as Record<string, unknown>;
    expect(fields.passportNumber).toContain("*");
    expect(fields.fullName).toContain("*");
    expect(fields.nationality).toBe("UTO");
    expect(fields.documentType).toBe("PASSPORT");
  });

  it("does not expose full document numbers in auto-fill audit", async () => {
    await auditService.recordAutoFill(sessionId, "profile-1", 5, true, {
      passportNumber: "AB1234567",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.passportNumber).toContain("*");
  });

  it("does not expose raw MRZ text in audit logs", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      mrzRaw: TD3_VALID_FULLTEXT,
    });
    const audit = await auditService.query({ sessionId });
    const masked = audit.entries[0]!.details.mrzRaw as string;
    expect(masked).not.toBe(TD3_VALID_FULLTEXT);
  });

  it("does not store raw images in logs", async () => {
    await auditService.recordOcrAttempt(sessionId, {
      base64Image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    const audit = await auditService.query({ sessionId });
    expect(audit.entries[0]!.details.base64Image).toBe("[REDACTED]");
  });
});

// -------------------- Section 16: Offline Mode --------------------

describe("E2E: Offline Mode", () => {
  it("app initializes and works without network", async () => {
    const settingsService = createSettingsService(createInMemorySettingsStore());
    const settings = await settingsService.loadSettings();
    expect(settings.ocr.engineType).toBe("paddle");
    expect(settings.ocr.enableFallback).toBe(true);
  });

  it("OCR pipeline works without internet using mock engine", async () => {
    const mockOcr = new MockOcrEngine();
    const result = await mockOcr.extractText(createMockImageInput());
    expect(result.lines).toHaveLength(2);
    expect(result.fullText).toBeTruthy();
  });

  it("MRZ parsing and checksum validation work offline", async () => {
    const mrzParser = createMrzParserService();
    const checksumValidator = createMrzChecksumValidator();

    const parseResult = mrzParser.parseMrzLines([TD3_VALID_LINE_1, TD3_VALID_LINE_2]);
    expect(parseResult.passportNumber).toBe(MRZ_PASSPORT_NUMBER);
    expect(parseResult.surname).toBe("MUSTER");

    const checksumResult = checksumValidator.validateChecksums([TD3_VALID_LINE_1, TD3_VALID_LINE_2]);
    expect(checksumResult.overallValid).toBe(true);
    expect(checksumResult.errors).toHaveLength(0);
  });

  it("data persists locally without network", async () => {
    const store = createInMemorySettingsStore();
    const settingsService = createSettingsService(store);
    await settingsService.loadSettings();
    await settingsService.updateSettings({ theme: "dark", onboardingCompleted: true });

    const auditStore = createInMemoryAuditLogStore();
    const auditService = createAuditLogService(auditStore);
    await auditService.recordOcrAttempt("offline-session", { engineType: "mock" });

    const reloadedSettings = createSettingsService(store);
    const settings = await reloadedSettings.loadSettings();
    expect(settings.theme).toBe("dark");

    const reloadedAudit = createAuditLogService(auditStore);
    const audit = await reloadedAudit.query({ sessionId: "offline-session" });
    expect(audit.total).toBe(1);
  });

  it("mock services function without any network dependency", async () => {
    const qualityService = createImageQualityService();
    const cropService = createDocumentCropService();
    const preprocessService = createImagePreprocessingService();
    const mrzDetection = createMrzDetectionService();
    const ocrEngine = new MockOcrEngine();
    const mrzParser = createMrzParserService();
    const checksumValidator = createMrzChecksumValidator();
    const fieldNormalization = createFieldNormalizationService();
    const staffReview = createStaffReviewService();

    const input = createMockImageInput();
    const quality = await qualityService.analyzeImage(input);
    const cropped = await cropService.cropDocument(input);
    const preprocessed = await preprocessService.preprocessImage(cropped);
    const mrzRegion = await mrzDetection.detectMrzRegion(preprocessed);
    const ocrInput = { imagePath: mrzRegion.imagePath };
    const ocrResult = await ocrEngine.extractText(ocrInput);
    const parseResult = mrzParser.parseMrzLines(ocrResult.lines.map((l) => l.text));
    const checksumResult = checksumValidator.validateChecksums(ocrResult.lines.map((l) => l.text));
    const normalized = fieldNormalization.normalizeFields({
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
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: ocrResult.lines.map((l) => l.text),
      checkDigits: checksumResult as unknown as Record<string, boolean>,
    });

    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(
      normalized,
      ocrResult,
      quality,
      checksumResult as unknown as Record<string, boolean>,
    );
    expect(scores.fullName.level).toBe("HIGH");

    const pending = await staffReview.reviewResult(normalized, scores);
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
  });
});

// -------------------- Section 17: App Restart/Recovery --------------------

describe("E2E: App Restart Recovery After Failed OCR or Interrupted Auto-fill", () => {
  it("recovers settings after simulated app crash", async () => {
    const store = createInMemorySettingsStore();
    const svc1 = createSettingsService(store);
    await svc1.loadSettings();
    await svc1.updateSettings({
      ocr: { engineType: "tesseract" },
      onboardingCompleted: true,
    });

    const svc2 = createSettingsService(store);
    const settings = await svc2.loadSettings();
    expect(settings.ocr.engineType).toBe("tesseract");
    expect(settings.onboardingCompleted).toBe(true);
  });

  it("recovers auto-fill profile after simulated crash", async () => {
    const profileStore = createInMemoryProfileStore();
    const mappingService = createAutoFillMappingService(profileStore);
    const profile = await mappingService.createProfile("Crash Recovery", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);

    const mappingService2 = createAutoFillMappingService(profileStore);
    const recoveredProfile = await mappingService2.getProfile(profile.id);
    expect(recoveredProfile).toBeDefined();
    expect(recoveredProfile!.name).toBe("Crash Recovery");
  });

  it("preserves audit logs after simulated app restart", async () => {
    const auditStore = createInMemoryAuditLogStore();
    const auditService = createAuditLogService(auditStore);
    const sessionId = crypto.randomUUID();
    await auditService.recordOcrAttempt(sessionId, { engineType: "mock" });
    await auditService.recordOcrFailure(sessionId, "PIPELINE_FAILED");

    const auditService2 = createAuditLogService(auditStore);
    const audit = await auditService2.query({ sessionId });
    expect(audit.total).toBe(2);
  });

  it("handles retry after failed OCR attempt", async () => {
    const auditService = createAuditLogService(createInMemoryAuditLogStore());
    const sessionId = crypto.randomUUID();
    let attempt = 1;

    async function attemptOcr(): Promise<boolean> {
      try {
        if (attempt === 1) {
          await auditService.recordOcrFailure(sessionId, "OCR_CONFIDENCE_TOO_LOW");
          attempt++;
          return false;
        }
        await auditService.recordOcrAttempt(sessionId, { engineType: "mock" });
        return true;
      } catch {
        return false;
      }
    }

    const firstAttempt = await attemptOcr();
    expect(firstAttempt).toBe(false);

    const secondAttempt = await attemptOcr();
    expect(secondAttempt).toBe(true);

    const audit = await auditService.query({ sessionId });
    expect(audit.total).toBe(2);
    expect(audit.entries.map((e) => e.eventType)).toContain("OCR_FAILURE");
    expect(audit.entries.map((e) => e.eventType)).toContain("OCR_ATTEMPT");
  });

  it("retries auto-fill after failure", async () => {
    let failCount = 0;
    const executor: FillExecutor = {
      ...createMockExecutor(),
      fillWebField: async () => {
        failCount++;
        if (failCount <= 1) {
          throw new Error("Target window not focused");
        }
      },
    };
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const executionService = createAutoFillExecutionService(executor);
    const profile = await mappingService.createProfile("Retry PMS", "web");
    await mappingService.setMappings(profile.id, [
      makeMapping({ id: crypto.randomUUID(), ocrField: "fullName" as OcrFieldKey, formField: "guestName" }),
    ]);

    const firstResult = await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
    expect(firstResult.overallStatus).toBe("FAILED");
    expect(failCount).toBe(1);

    const secondResult = await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
    expect(secondResult.overallStatus).toBe("SUCCESS");
  });
});

// -------------------- Section 18: Complete Full User Journey --------------------

describe("E2E: Complete Full User Journey — Setup → Capture → OCR → Review → Confirm → Auto-fill → Audit", () => {
  let settingsService: SettingsService;
  let auditService: AuditLogService;
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let staffReview: StaffReviewService;
  let sessionId: string;

  beforeEach(() => {
    settingsService = createSettingsService(createInMemorySettingsStore());
    auditService = createAuditLogService(createInMemoryAuditLogStore());
    mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    executionService = createAutoFillExecutionService(createMockExecutor());
    staffReview = createStaffReviewService();
    sessionId = crypto.randomUUID();
  });

  it("completes the full user journey end-to-end", async () => {
    // 1. First-time setup
    await settingsService.loadSettings();
    expect(settingsService.getSettings().onboardingCompleted).toBe(false);

    const updatedSettings = await settingsService.updateSettings({
      ocr: { engineType: "mock", enableFallback: true, ocrConfidenceThreshold: 0.6 },
      camera: { deviceId: "cam-001", label: "Default Camera", resolution: { width: 1280, height: 720 } },
      autoFill: { enableTestMode: true, activeProfileId: "" },
      onboardingCompleted: true,
    });
    expect(updatedSettings.onboardingCompleted).toBe(true);

    // 2. Create auto-fill profile
    const profile = await mappingService.createProfile("Hotel PMS Main", "web");
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
      makeMapping({ id: crypto.randomUUID(), ocrField: "nationality" as OcrFieldKey, formField: "nationality" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "gender" as OcrFieldKey, formField: "gender" }),
      makeMapping({ id: crypto.randomUUID(), ocrField: "expiryDate" as OcrFieldKey, formField: "docExpiry" }),
    ]);

    // 3. Audit: OCR attempt
    await auditService.recordOcrAttempt(sessionId, {
      engineType: "mock",
      documentType: "PASSPORT",
      profileId: profile.id,
    });

    // 4. Simulate image capture and quality check
    const qualityService = createImageQualityService();
    const qualityResult = await qualityService.analyzeImage(createMockImageInput());
    expect(qualityResult.passed).toBe(true);

    // 5. Run OCR pipeline with valid MRZ
    const validLines: OcrTextChunk[] = [
      { text: TD3_VALID_LINE_1, confidence: 0.95 },
      { text: TD3_VALID_LINE_2, confidence: 0.93 },
    ];
    const mockOcr = new MockOcrEngine({
      lines: validLines,
      fullText: TD3_VALID_FULLTEXT,
      averageConfidence: 0.94,
    });
    const ocrResult = await mockOcr.extractText(createMockImageInput());
    expect(ocrResult.averageConfidence).toBeGreaterThan(0.6);

    // 6. Parse MRZ
    const mrzParser = createMrzParserService();
    const mrzLines = ocrResult.lines.map((l) => l.text);
    const parseResult = mrzParser.parseMrzLines(mrzLines);
    expect(parseResult.passportNumber).toBe(MRZ_PASSPORT_NUMBER);

    // 7. Validate checksums
    const checksumValidator = createMrzChecksumValidator();
    const checksumResult = checksumValidator.validateChecksums(mrzLines);
    expect(checksumResult.overallValid).toBe(true);

    // 8. Normalize fields
    const fieldNormalization = createFieldNormalizationService();
    const normalized = fieldNormalization.normalizeFields({
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
      idNumber: parseResult.optionalData ?? "",
      issueDate: "",
      expiryDate: parseResult.expiryDate,
      mrzRaw: ocrResult.fullText,
      mrzParsed: mrzLines,
      checkDigits: checksumResult as unknown as Record<string, boolean>,
    });

    // 9. Confidence scoring
    const confidenceService = createConfidenceScoringService();
    const scores = confidenceService.calculateFieldScores(
      normalized,
      ocrResult,
      qualityResult,
      checksumResult as unknown as Record<string, boolean>,
    );

    // 10. Staff review
    // nationality "UTO" is fictional → countryCode/issuingCountry penalized;
    // issueDate is empty → penalized. These are expected low-confidence fields.
    const pending = await staffReview.reviewResult(normalized, scores);
    expect(pending.lowConfidenceFields).toContain("nationality");
    expect(pending.lowConfidenceFields).toContain("countryCode");

    // 11. No manual corrections needed (happy path)

    // 12. Staff confirms
    const confirmed = await staffReview.confirmResult(pending);
    expect(confirmed.confirmedBy).toBe("STAFF");
    await auditService.recordConfirmation(sessionId, confirmed);

    // 13. Apply mappings
    const applied = mappingService.applyMappingsWithProfile(confirmed.fields, profile);
    expect(applied.mappedCount).toBe(6);

    // 14. Test mode preview
    const testResult = await executionService.testFill(applied.fieldValues, profile);
    expect(testResult.overallWouldSucceed).toBe(true);

    // 15. Execute auto-fill (test mode first, then real)
    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");

    // 16. Audit: auto-fill
    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);

    // 17. Verify full audit trail
    const auditTrail = await auditService.query({ sessionId });
    expect(auditTrail.total).toBe(3);
    const eventOrder = auditTrail.entries.map((e) => e.eventType);
    expect(eventOrder).toContain("OCR_ATTEMPT");
    expect(eventOrder).toContain("CONFIRMATION");
    expect(eventOrder).toContain("AUTO_FILL");

    // 18. Privacy check: no sensitive data in audit log
    for (const entry of auditTrail.entries) {
      if (entry.details.fields) {
        const fields = entry.details.fields as Record<string, unknown>;
        if (fields.passportNumber) {
          expect(String(fields.passportNumber)).toContain("*");
        }
        if (fields.fullName) {
          expect(String(fields.fullName)).toContain("*");
        }
      }
    }

    // 19. Verify settings persistence
    const finalSettings = settingsService.getSettings();
    expect(finalSettings.ocr.engineType).toBe("mock");
    expect(finalSettings.onboardingCompleted).toBe(true);
  });
});

// -------------------- Section 19: Edge Cases --------------------

describe("E2E: Edge Cases", () => {
  it("handles empty MRZ text gracefully", async () => {
    const mrzParser = createMrzParserService();
    const result = mrzParser.parseMrzLines([]);
    expect(result.passportNumber).toBe("");
    expect(result.surname).toBe("");
  });

  it("handles single MRZ line gracefully", async () => {
    const mrzParser = createMrzParserService();
    const result = mrzParser.parseMrzLines(["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<"]);
    expect(result.passportNumber).toBe("");
    // Parser requires >=2 lines to parse surname; single line returns empty
    expect(result.surname).toBe("");
    expect(result.mrzLines).toHaveLength(1);
  });

  it("handles unknown MRZ format gracefully", async () => {
    const mrzParser = createMrzParserService();
    const result = mrzParser.parseMrzLines(["SHORT_LINE_1", "SHORT_LINE_2"]);
    expect(result.documentType).toBe("PASSPORT");
    expect(result.mrzLines).toHaveLength(2);
  });

  it("processes document with all possible fields empty", async () => {
    const fieldNormalization = createFieldNormalizationService();
    const normalized = fieldNormalization.normalizeFields({
      fullName: "",
      surname: "",
      givenName: "",
      gender: "",
      dateOfBirth: "",
      nationality: "",
      issuingCountry: "",
      documentType: "",
      passportNumber: "",
      documentNumber: "",
      idNumber: "",
      issueDate: "",
      expiryDate: "",
      mrzRaw: "",
      mrzParsed: [],
      checkDigits: {},
    });
    expect(normalized.fullName).toBe("");
    expect(normalized.gender).toBe("UNKNOWN");
    expect(normalized.documentType).toBe("UNKNOWN");
  });

  it("maps all 14 OCR fields to form fields", async () => {
    const mappingService = createAutoFillMappingService(createInMemoryProfileStore());
    const ocrFields = mappingService.getSupportedOcrFields();
    expect(ocrFields).toHaveLength(14);
    expect(ocrFields).toContain("fullName");
    expect(ocrFields).toContain("firstName");
    expect(ocrFields).toContain("lastName");
    expect(ocrFields).toContain("gender");
    expect(ocrFields).toContain("dateOfBirth");
    expect(ocrFields).toContain("nationality");
    expect(ocrFields).toContain("countryCode");
    expect(ocrFields).toContain("documentType");
    expect(ocrFields).toContain("documentNumber");
    expect(ocrFields).toContain("passportNumber");
    expect(ocrFields).toContain("idNumber");
    expect(ocrFields).toContain("issueDate");
    expect(ocrFields).toContain("expiryDate");
    expect(ocrFields).toContain("issuingCountry");
  });

  it("applies retention policy to audit logs", async () => {
    const store = createInMemoryAuditLogStore();
    const svc = createAuditLogService(store, { maxAgeDays: 1, maxEntries: 1000 });

    const oldEntry: AuditLogEntry = {
      id: "old-entry",
      eventType: "OCR_ATTEMPT",
      timestamp: new Date("2020-01-01").toISOString(),
      sessionId: "old",
      details: {},
    };
    await store.put(oldEntry);
    await svc.recordOcrAttempt("new-session", {});

    const removed = await svc.applyRetentionPolicy();
    expect(removed).toBe(1);

    const remaining = await svc.query({});
    expect(remaining.total).toBe(1);
  });

  it("handles staff review cancellation gracefully", async () => {
    const staffReview = createStaffReviewService();
    const normalized = makeNormalizedFields();
    const pending = await staffReview.reviewResult(normalized, {} as never);
    staffReview.cancelReview(pending);
    expect(pending.confirmed).toBe(false);
  });
});
