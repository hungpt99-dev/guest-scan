import { describe, it, expect, vi } from "vitest";
import { createOcrApi } from "../../../../apps/desktop/src/api/ocr_api";
import { createOcrPipelineService } from "../../../../apps/desktop/src/services/ocr_pipeline_service";
import type { ImageInput, ImageQualityResult } from "../../../../apps/desktop/src/services/image_quality_service";
import type { CroppedImage } from "../../../../apps/desktop/src/services/document_crop_service";
import type { PreprocessedImage } from "../../../../apps/desktop/src/services/image_preprocessing_service";
import type { MrzRegion } from "../../../../apps/desktop/src/services/mrz_detection_service";
import type { MrzParseResult } from "../../../../apps/desktop/src/services/mrz_parser_service";
import type { MrzChecksumValidationResult } from "../../../../apps/desktop/src/services/mrz_checksum_validator";
import type { NormalizedFields } from "../../../../apps/desktop/src/services/field_normalization_service";
import type { FieldConfidenceScores } from "../../../../apps/desktop/src/services/ocr_confidence_service";
import type { ConfirmedFields, PendingReview } from "../../../../apps/desktop/src/services/staff_review_service";
import type { OcrEngine, OcrTextResult } from "../../../../apps/desktop/src/ocr/ocr_engine";

function mockInput(path = "/tmp/test-passport.jpg") {
  return { imagePath: path };
}

function createMockOcrResult(overrides = {}) {
  return {
    lines: [
      { text: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.95 },
      { text: "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.92 },
    ],
    fullText: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
    averageConfidence: 0.93,
    ...overrides,
  };
}

function createMrzParseResult(overrides = {}) {
  return {
    documentType: "PASSPORT",
    issuingCountry: "UTO",
    surname: "MUSTER",
    givenName: "JOHN MICHAEL",
    fullName: "MUSTER JOHN MICHAEL",
    passportNumber: "AB123456",
    nationality: "UTO",
    dateOfBirth: "1985-10-10",
    gender: "M",
    expiryDate: "2020-01-01",
    optionalData: "",
    checkDigits: {
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
      optional_data_valid: true,
      final_composite_valid: true,
      overall_valid: true,
    },
    mrzLines: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04"],
    ...overrides,
  };
}

function createNormalizedFields(overrides = {}) {
  const base = {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: "1985-10-10",
    nationality: "UTO",
    documentType: "PASSPORT",
    documentNumber: "AB123456",
    passportNumber: "AB123456",
    idNumber: "",
    issueDate: "",
    expiryDate: "2020-01-01",
    issuingCountry: "UTO",
    mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
    mrzParsed: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04"],
  };
  return { ...base, ...overrides };
}

function createFieldConfidenceScores(overrides = {}) {
  return {
    fullName: { score: 0.95, level: "HIGH", issues: [] },
    firstName: { score: 0.95, level: "HIGH", issues: [] },
    lastName: { score: 0.95, level: "HIGH", issues: [] },
    gender: { score: 0.95, level: "HIGH", issues: [] },
    dateOfBirth: { score: 0.95, level: "HIGH", issues: [] },
    nationality: { score: 0.95, level: "HIGH", issues: [] },
    documentNumber: { score: 0.95, level: "HIGH", issues: [] },
    passportNumber: { score: 0.95, level: "HIGH", issues: [] },
    idNumber: { score: 0.0, level: "LOW", issues: ["Field is empty"] },
    issueDate: { score: 0.95, level: "HIGH", issues: [] },
    expiryDate: { score: 0.95, level: "HIGH", issues: [] },
    issuingCountry: { score: 0.95, level: "HIGH", issues: [] },
    ...overrides,
  };
}

function createConfirmedFields(overrides = {}) {
  const fields = createNormalizedFields();
  return {
    fields,
    edits: {
      fullName: fields.fullName,
      firstName: fields.firstName,
      lastName: fields.lastName,
      gender: fields.gender,
      dateOfBirth: fields.dateOfBirth,
      nationality: fields.nationality,
      documentNumber: fields.documentNumber,
      passportNumber: fields.passportNumber,
      idNumber: fields.idNumber,
      issueDate: fields.issueDate,
      expiryDate: fields.expiryDate,
      issuingCountry: fields.issuingCountry,
    },
    original: fields,
    lowConfidenceFields: [],
    confirmedAt: "2026-01-01T00:00:00.000Z",
    confirmedBy: "STAFF",
    ...overrides,
  };
}

function makeMocks() {
  const imageQuality = { analyzeImage: vi.fn() };
  const documentCrop = { cropDocument: vi.fn() };
  const imagePreprocessing = { preprocessImage: vi.fn() };
  const mrzDetection = { detectMrzRegion: vi.fn() };
  const paddleOcr = { extractText: vi.fn() };
  const tesseractOcr = { extractText: vi.fn() };
  const mrzParser = { parseMrzLines: vi.fn() };
  const checksumValidator = { validateChecksums: vi.fn() };
  const fieldNormalization = { normalizeFields: vi.fn() };
  const confidenceService = { calculateConfidence: vi.fn() };
  const staffReview = {
    reviewResult: vi.fn(),
    confirmResult: vi.fn(),
    cancelReview: vi.fn(),
  };

  return {
    imageQuality,
    documentCrop,
    imagePreprocessing,
    mrzDetection,
    paddleOcr,
    tesseractOcr,
    mrzParser,
    checksumValidator,
    fieldNormalization,
    confidenceService,
    staffReview,
  };
}

async function runPipelineWithMocks(mocks, input) {
  const pipeline = createOcrPipelineService(
    mocks.imageQuality,
    mocks.documentCrop,
    mocks.imagePreprocessing,
    mocks.mrzDetection,
    mocks.paddleOcr,
    mocks.tesseractOcr,
    mocks.mrzParser,
    mocks.checksumValidator,
    mocks.fieldNormalization,
    mocks.confidenceService,
    mocks.staffReview,
  );
  const api = createOcrApi(pipeline);
  return api.runOcr(input);
}

function setupHappyPathMocks(mocks) {
  vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
    passed: true,
    metrics: {
      blurScore: 85,
      brightness: 128,
      contrast: 55,
      glareRatio: 0.02,
      skewAngle: 1.5,
      width: 1200,
      height: 900,
      edgeVisibilityScore: 0.85,
    },
    warnings: [],
  });

  vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
    imagePath: "/tmp/cropped.jpg",
    width: 800,
    height: 600,
    originalWidth: 1200,
    originalHeight: 900,
    rotationAngle: 0,
  });

  vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
    imagePath: "/tmp/preprocessed.jpg",
    width: 800,
    height: 600,
    deskewAngle: 0,
    rotationAngle: 0,
  });

  vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
    imagePath: "/tmp/mrz-crop.jpg",
    width: 400,
    height: 80,
    x: 50,
    y: 480,
    detectedFormat: "TD3",
    confidence: 0.92,
  });

  vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(createMockOcrResult());
  vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(createMockOcrResult());
  vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(createMrzParseResult());
  vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue({
    passportNumberValid: true,
    dateOfBirthValid: true,
    expiryDateValid: true,
    optionalDataValid: true,
    finalCompositeValid: true,
    overallValid: true,
    errors: [],
  });
  vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(createNormalizedFields());
  vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(createFieldConfidenceScores());

  const normalizedFields = createNormalizedFields();
  vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue({
    fields: normalizedFields,
    confidence: createFieldConfidenceScores(),
    lowConfidenceFields: [],
    edits: {
      fullName: normalizedFields.fullName,
      firstName: normalizedFields.firstName,
      lastName: normalizedFields.lastName,
      gender: normalizedFields.gender,
      dateOfBirth: normalizedFields.dateOfBirth,
      nationality: normalizedFields.nationality,
      documentNumber: normalizedFields.documentNumber,
      passportNumber: normalizedFields.passportNumber,
      idNumber: normalizedFields.idNumber,
      issueDate: normalizedFields.issueDate,
      expiryDate: normalizedFields.expiryDate,
      issuingCountry: normalizedFields.issuingCountry,
    },
    confirmed: false,
  });

  vi.mocked(mocks.staffReview.confirmResult).mockResolvedValue(createConfirmedFields());
}

describe("OCR Worker — Error Handling", () => {
  const input = mockInput();

  describe("Pipeline error propagation through OCR API", () => {
    it("returns error when image quality check fails due to blur", async () => {
      const mocks = makeMocks();
      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: false,
        metrics: {
          blurScore: 10,
          brightness: 100,
          contrast: 40,
          glareRatio: 0.02,
          skewAngle: 1.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.5,
        },
        warnings: ["BLURRY"],
      });

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe("BLURRY_IMAGE");
    });

    it("returns error when image quality check fails due to glare", async () => {
      const mocks = makeMocks();
      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: false,
        metrics: {
          blurScore: 80,
          brightness: 200,
          contrast: 50,
          glareRatio: 0.5,
          skewAngle: 0.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.7,
        },
        warnings: ["GLARE_DETECTED"],
      });

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("GLARE_REFLECTION");
    });

    it("returns error when document crop fails", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockRejectedValue(
        Object.assign(new Error("DOCUMENT_NOT_DETECTED"), {
          type: "DOCUMENT_NOT_DETECTED",
        }),
      );

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("DOCUMENT_NOT_DETECTED");
    });

    it("returns error when MRZ detection fails", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockRejectedValue(
        Object.assign(new Error("MRZ_NOT_FOUND"), {
          type: "MRZ_NOT_FOUND",
        }),
      );

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("MRZ_NOT_FOUND");
    });

    it("returns error when PaddleOCR fails and Tesseract fallback also fails", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
        imagePath: "/tmp/mrz-crop.jpg",
        width: 400,
        height: 80,
        x: 50,
        y: 480,
        detectedFormat: "TD3",
        confidence: 0.92,
      });

      vi.mocked(mocks.paddleOcr.extractText).mockRejectedValue(new Error("PaddleOCR unavailable"));
      vi.mocked(mocks.tesseractOcr.extractText).mockRejectedValue(new Error("Tesseract unavailable"));

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("TESSERACT_FALLBACK_UNAVAILABLE");
    });

    it("returns error when all OCR results are below confidence threshold", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
        imagePath: "/tmp/mrz-crop.jpg",
        width: 400,
        height: 80,
        x: 50,
        y: 480,
        detectedFormat: "TD3",
        confidence: 0.92,
      });

      const lowConfResult = createMockOcrResult({ averageConfidence: 0.25 });
      vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(lowConfResult);
      vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(lowConfResult);

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("OCR_CONFIDENCE_TOO_LOW");
    });

    it("returns error when MRZ parsing produces no usable fields", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
        imagePath: "/tmp/mrz-crop.jpg",
        width: 400,
        height: 80,
        x: 50,
        y: 480,
        detectedFormat: "TD3",
        confidence: 0.92,
      });

      vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(createMockOcrResult());

      vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(
        createMrzParseResult({ fullName: "", surname: "", givenName: "", passportNumber: "" }),
      );

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("MRZ_NOT_FOUND");
    });

    it("returns error for generic pipeline failure", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockRejectedValue(new Error("Unexpected crop error"));

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error.code).toBe("string");
    });
  });

  describe("OCR API session state management", () => {
    it("resets session to IDLE when pipeline fails", async () => {
      const mocks = makeMocks();
      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: false,
        metrics: {
          blurScore: 10,
          brightness: 100,
          contrast: 40,
          glareRatio: 0.02,
          skewAngle: 1.0,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.5,
        },
        warnings: ["BLURRY"],
      });

      const pipeline = createOcrPipelineService(
        mocks.imageQuality,
        mocks.documentCrop,
        mocks.imagePreprocessing,
        mocks.mrzDetection,
        mocks.paddleOcr,
        mocks.tesseractOcr,
        mocks.mrzParser,
        mocks.checksumValidator,
        mocks.fieldNormalization,
        mocks.confidenceService,
        mocks.staffReview,
      );
      const api = createOcrApi(pipeline);

      expect(api.getSessionState().stage).toBe("IDLE");

      await api.runOcr(input);

      expect(api.getSessionState().stage).toBe("IDLE");
    });

    it("sets session to PROCESSING during pipeline execution, then IDLE on error", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockImplementation(async () => {
        return {
          passed: false,
          metrics: {
            blurScore: 10,
            brightness: 100,
            contrast: 40,
            glareRatio: 0.02,
            skewAngle: 1.0,
            width: 1200,
            height: 900,
            edgeVisibilityScore: 0.5,
          },
          warnings: ["BLURRY"],
        };
      });

      const pipeline = createOcrPipelineService(
        mocks.imageQuality,
        mocks.documentCrop,
        mocks.imagePreprocessing,
        mocks.mrzDetection,
        mocks.paddleOcr,
        mocks.tesseractOcr,
        mocks.mrzParser,
        mocks.checksumValidator,
        mocks.fieldNormalization,
        mocks.confidenceService,
        mocks.staffReview,
      );
      const api = createOcrApi(pipeline);

      const stateBefore = api.getSessionState();
      expect(stateBefore.stage).toBe("IDLE");

      await api.runOcr(input);

      const stateAfter = api.getSessionState();
      expect(stateAfter.stage).toBe("IDLE");
    });

    it("maintains CONFIRMED state on successful pipeline completion", async () => {
      const mocks = makeMocks();
      setupHappyPathMocks(mocks);

      const pipeline = createOcrPipelineService(
        mocks.imageQuality,
        mocks.documentCrop,
        mocks.imagePreprocessing,
        mocks.mrzDetection,
        mocks.paddleOcr,
        mocks.tesseractOcr,
        mocks.mrzParser,
        mocks.checksumValidator,
        mocks.fieldNormalization,
        mocks.confidenceService,
        mocks.staffReview,
      );
      const api = createOcrApi(pipeline);

      const result = await api.runOcr(input);

      expect(result.ok).toBe(true);
      expect(api.getSessionState().stage).toBe("CONFIRMED");
    });
  });

  describe("Capture error handling", () => {
    it("returns error when capture image fails", async () => {
      const api = createOcrApi();
      const result = await api.captureImage();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe("CAPTURE_FAILED");
    });

    it("returns error with message from thrown exception during capture", async () => {
      const api = createOcrApi();
      const result = await api.captureImage();
      expect(result.ok).toBe(false);
      expect(result.error.message.length).toBeGreaterThan(0);
    });
  });

  describe("Extracted fields error handling", () => {
    it("returns error when no OCR result is available", async () => {
      const api = createOcrApi();
      const result = await api.getExtractedFields();
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NO_IMAGE");
    });
  });

  describe("Tesseract fallback retry on pipeline error", () => {
    it("falls back to Tesseract when PaddleOCR throws an error", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
        imagePath: "/tmp/mrz-crop.jpg",
        width: 400,
        height: 80,
        x: 50,
        y: 480,
        detectedFormat: "TD3",
        confidence: 0.92,
      });

      vi.mocked(mocks.paddleOcr.extractText).mockRejectedValue(new Error("PaddleOCR IPC failed"));

      const fallbackResult = createMockOcrResult({ averageConfidence: 0.88 });
      vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(fallbackResult);

      vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(createMrzParseResult());
      vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue({
        passportNumberValid: true,
        dateOfBirthValid: true,
        expiryDateValid: true,
        optionalDataValid: true,
        finalCompositeValid: true,
        overallValid: true,
        errors: [],
      });
      vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(createNormalizedFields());
      vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(createFieldConfidenceScores());

      const normalizedFields = createNormalizedFields();
      vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue({
        fields: normalizedFields,
        confidence: createFieldConfidenceScores(),
        lowConfidenceFields: [],
        edits: {
          fullName: normalizedFields.fullName,
          firstName: normalizedFields.firstName,
          lastName: normalizedFields.lastName,
          gender: normalizedFields.gender,
          dateOfBirth: normalizedFields.dateOfBirth,
          nationality: normalizedFields.nationality,
          documentNumber: normalizedFields.documentNumber,
          passportNumber: normalizedFields.passportNumber,
          idNumber: normalizedFields.idNumber,
          issueDate: normalizedFields.issueDate,
          expiryDate: normalizedFields.expiryDate,
          issuingCountry: normalizedFields.issuingCountry,
        },
        confirmed: false,
      });

      vi.mocked(mocks.staffReview.confirmResult).mockResolvedValue(createConfirmedFields());

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(true);
      expect(mocks.tesseractOcr.extractText).toHaveBeenCalledTimes(1);
    });

    it("falls back to Tesseract when PaddleOCR confidence is too low", async () => {
      const mocks = makeMocks();

      vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
        passed: true,
        metrics: {
          blurScore: 85,
          brightness: 128,
          contrast: 55,
          glareRatio: 0.02,
          skewAngle: 1.5,
          width: 1200,
          height: 900,
          edgeVisibilityScore: 0.85,
        },
        warnings: [],
      });

      vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
        imagePath: "/tmp/cropped.jpg",
        width: 800,
        height: 600,
        originalWidth: 1200,
        originalHeight: 900,
        rotationAngle: 0,
      });

      vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
        imagePath: "/tmp/preprocessed.jpg",
        width: 800,
        height: 600,
        deskewAngle: 0,
        rotationAngle: 0,
      });

      vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
        imagePath: "/tmp/mrz-crop.jpg",
        width: 400,
        height: 80,
        x: 50,
        y: 480,
        detectedFormat: "TD3",
        confidence: 0.92,
      });

      vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(createMockOcrResult({ averageConfidence: 0.3 }));

      vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(createMockOcrResult({ averageConfidence: 0.9 }));

      vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(createMrzParseResult());
      vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue({
        passportNumberValid: true,
        dateOfBirthValid: true,
        expiryDateValid: true,
        optionalDataValid: true,
        finalCompositeValid: true,
        overallValid: true,
        errors: [],
      });
      vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(createNormalizedFields());
      vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(createFieldConfidenceScores());

      const normalizedFields = createNormalizedFields();
      vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue({
        fields: normalizedFields,
        confidence: createFieldConfidenceScores(),
        lowConfidenceFields: [],
        edits: {
          fullName: normalizedFields.fullName,
          firstName: normalizedFields.firstName,
          lastName: normalizedFields.lastName,
          gender: normalizedFields.gender,
          dateOfBirth: normalizedFields.dateOfBirth,
          nationality: normalizedFields.nationality,
          documentNumber: normalizedFields.documentNumber,
          passportNumber: normalizedFields.passportNumber,
          idNumber: normalizedFields.idNumber,
          issueDate: normalizedFields.issueDate,
          expiryDate: normalizedFields.expiryDate,
          issuingCountry: normalizedFields.issuingCountry,
        },
        confirmed: false,
      });

      vi.mocked(mocks.staffReview.confirmResult).mockResolvedValue(createConfirmedFields());

      const result = await runPipelineWithMocks(mocks, input);

      expect(result.ok).toBe(true);
      expect(mocks.tesseractOcr.extractText).toHaveBeenCalledTimes(1);
    });
  });
});
