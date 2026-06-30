import { describe, it, expect, vi } from "vitest";
import type { ImageInput, ImageQualityService, ImageQualityResult } from "../../services/image_quality_service";
import type { DocumentCropService, CroppedImage } from "../../services/document_crop_service";
import type { ImagePreprocessingService, PreprocessedImage } from "../../services/image_preprocessing_service";
import type { MrzDetectionService, MrzRegion } from "../../services/mrz_detection_service";
import type { MrzParserService, MrzParseResult } from "../../services/mrz_parser_service";
import type { MrzChecksumValidator, MrzChecksumValidationResult } from "../../services/mrz_checksum_validator";
import type { FieldNormalizationService, NormalizedFields } from "../../services/field_normalization_service";
import type { OcrConfidenceService, FieldConfidenceScores } from "../../services/ocr_confidence_service";
import type { StaffReviewService, ConfirmedFields, PendingReview } from "../../services/staff_review_service";
import type { OcrEngine, OcrTextResult } from "../../ocr/ocr_engine";
import { createOcrPipelineService } from "../../services/ocr_pipeline_service";

function createMockOcrResult(overrides: Partial<OcrTextResult> = {}): OcrTextResult {
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

function createMrzParseResult(overrides: Partial<MrzParseResult> = {}): MrzParseResult {
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

function createChecksumValidationResult(
  overrides: Partial<MrzChecksumValidationResult> = {},
): MrzChecksumValidationResult {
  return {
    passportNumberValid: true,
    dateOfBirthValid: true,
    expiryDateValid: true,
    optionalDataValid: true,
    finalCompositeValid: true,
    overallValid: true,
    errors: [],
    ...overrides,
  };
}

function createNormalizedFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: "1985-10-10",
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: "AB123456",
    passportNumber: "AB123456",
    idNumber: "",
    issueDate: "",
    expiryDate: "2020-01-01",
    issuingCountry: "UTO",
    mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
    mrzParsed: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04"],
    rawOriginal: {
      fullName: "MUSTER JOHN MICHAEL",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      gender: "M",
      dateOfBirth: "851010",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "P",
      passportNumber: "AB123456",
      documentNumber: "AB123456",
      idNumber: "",
      issueDate: "",
      expiryDate: "200101",
      mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
    },
    ...overrides,
  };
}

function createFieldConfidenceScores(overrides: Partial<FieldConfidenceScores> = {}): FieldConfidenceScores {
  return {
    fullName: { score: 0.95, level: "HIGH", issues: [] },
    firstName: { score: 0.95, level: "HIGH", issues: [] },
    lastName: { score: 0.95, level: "HIGH", issues: [] },
    gender: { score: 0.95, level: "HIGH", issues: [] },
    dateOfBirth: { score: 0.95, level: "HIGH", issues: [] },
    nationality: { score: 0.95, level: "HIGH", issues: [] },
    countryCode: { score: 0.95, level: "HIGH", issues: [] },
    documentType: { score: 0.95, level: "HIGH", issues: [] },
    documentNumber: { score: 0.95, level: "HIGH", issues: [] },
    passportNumber: { score: 0.95, level: "HIGH", issues: [] },
    idNumber: { score: 0.0, level: "LOW", issues: ["Field is empty"] },
    issueDate: { score: 0.95, level: "HIGH", issues: [] },
    expiryDate: { score: 0.95, level: "HIGH", issues: [] },
    issuingCountry: { score: 0.95, level: "HIGH", issues: [] },
    mrzRaw: { score: 0.92, level: "HIGH", issues: [] },
    ...overrides,
  };
}

function createConfirmedFields(overrides: Partial<ConfirmedFields> = {}): ConfirmedFields {
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
      countryCode: fields.countryCode,
      documentType: fields.documentType,
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

describe("OcrPipelineService", () => {
  const imageInput: ImageInput = { imagePath: "/tmp/test-image.jpg" };

  function makeMocks() {
    const imageQuality = {
      analyzeImage: vi.fn(),
    } as unknown as ImageQualityService;

    const documentCrop = {
      cropDocument: vi.fn(),
    } as unknown as DocumentCropService;

    const imagePreprocessing = {
      preprocessImage: vi.fn(),
    } as unknown as ImagePreprocessingService;

    const mrzDetection = {
      detectMrzRegion: vi.fn(),
    } as unknown as MrzDetectionService;

    const paddleOcr = {
      extractText: vi.fn(),
    } as unknown as OcrEngine;

    const tesseractOcr = {
      extractText: vi.fn(),
    } as unknown as OcrEngine;

    const mrzParser = {
      parseMrzLines: vi.fn(),
    } as unknown as MrzParserService;

    const checksumValidator = {
      validateChecksums: vi.fn(),
    } as unknown as MrzChecksumValidator;

    const fieldNormalization = {
      normalizeFields: vi.fn(),
    } as unknown as FieldNormalizationService;

    const confidenceService = {
      calculateConfidence: vi.fn(),
    } as unknown as OcrConfidenceService;

    const staffReview = {
      reviewResult: vi.fn(),
      editField: vi.fn(),
      confirmResult: vi.fn(),
      cancelReview: vi.fn(),
    } as unknown as StaffReviewService;

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

  it("completes full pipeline with valid inputs", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    const ocrResult = createMockOcrResult();
    vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(ocrResult);

    const parseResult = createMrzParseResult();
    vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(parseResult);

    const checksumResult = createChecksumValidationResult();
    vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue(checksumResult);

    const normalizedFields = createNormalizedFields();
    vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(normalizedFields);

    const confidenceScores = createFieldConfidenceScores();
    vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(confidenceScores);

    const pending: PendingReview = {
      fields: normalizedFields,
      confidence: confidenceScores,
      lowConfidenceFields: [],
      edits: {
        fullName: normalizedFields.fullName,
        firstName: normalizedFields.firstName,
        lastName: normalizedFields.lastName,
        gender: normalizedFields.gender,
        dateOfBirth: normalizedFields.dateOfBirth,
        nationality: normalizedFields.nationality,
        countryCode: normalizedFields.countryCode,
        documentType: normalizedFields.documentType,
        documentNumber: normalizedFields.documentNumber,
        passportNumber: normalizedFields.passportNumber,
        idNumber: normalizedFields.idNumber,
        issueDate: normalizedFields.issueDate,
        expiryDate: normalizedFields.expiryDate,
        issuingCountry: normalizedFields.issuingCountry,
      },
      confirmed: false,
    };
    vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue(pending);

    const confirmedFields = createConfirmedFields();
    vi.mocked(mocks.staffReview.confirmResult).mockResolvedValue(confirmedFields);

    const service = createOcrPipelineService(
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

    const result = await service.runOcrPipeline(imageInput);

    expect(result.confirmedBy).toBe("STAFF");
    expect(result.fields.fullName).toBe("MUSTER JOHN MICHAEL");
    expect(result.lowConfidenceFields).toEqual([]);
  });

  it("rejects pipeline when image quality check fails", async () => {
    const mocks = makeMocks();

    vi.mocked(mocks.imageQuality.analyzeImage).mockResolvedValue({
      passed: false,
      metrics: {
        blurScore: 20,
        brightness: 128,
        contrast: 55,
        glareRatio: 0.02,
        skewAngle: 1.5,
        width: 1200,
        height: 900,
        edgeVisibilityScore: 0.85,
      },
      warnings: ["BLURRY"],
    } as ImageQualityResult);

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "BLURRY_IMAGE",
    });
  });

  it("falls back to Tesseract when PaddleOCR confidence is low", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    const lowConfidenceResult = createMockOcrResult({ averageConfidence: 0.3 });
    vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(lowConfidenceResult);

    const highConfidenceResult = createMockOcrResult({ averageConfidence: 0.9 });
    vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(highConfidenceResult);

    const parseResult = createMrzParseResult();
    vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(parseResult);

    const checksumResult = createChecksumValidationResult();
    vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue(checksumResult);

    const normalizedFields = createNormalizedFields();
    vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(normalizedFields);

    const confidenceScores = createFieldConfidenceScores();
    vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(confidenceScores);

    const pending: PendingReview = {
      fields: normalizedFields,
      confidence: confidenceScores,
      lowConfidenceFields: [],
      edits: {
        fullName: normalizedFields.fullName,
        firstName: normalizedFields.firstName,
        lastName: normalizedFields.lastName,
        gender: normalizedFields.gender,
        dateOfBirth: normalizedFields.dateOfBirth,
        nationality: normalizedFields.nationality,
        countryCode: normalizedFields.countryCode,
        documentType: normalizedFields.documentType,
        documentNumber: normalizedFields.documentNumber,
        passportNumber: normalizedFields.passportNumber,
        idNumber: normalizedFields.idNumber,
        issueDate: normalizedFields.issueDate,
        expiryDate: normalizedFields.expiryDate,
        issuingCountry: normalizedFields.issuingCountry,
      },
      confirmed: false,
    };
    vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue(pending);

    const confirmedFields = createConfirmedFields();
    vi.mocked(mocks.staffReview.confirmResult).mockResolvedValue(confirmedFields);

    const service = createOcrPipelineService(
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

    const result = await service.runOcrPipeline(imageInput);

    expect(result.confirmedBy).toBe("STAFF");
    expect(mocks.tesseractOcr.extractText).toHaveBeenCalled();
  });

  it("throws TESSERACT_FALLBACK_UNAVAILABLE when both OCR engines fail", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    vi.mocked(mocks.paddleOcr.extractText).mockRejectedValue(new Error("PaddleOCR unavailable"));
    vi.mocked(mocks.tesseractOcr.extractText).mockRejectedValue(new Error("Tesseract unavailable"));

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "TESSERACT_FALLBACK_UNAVAILABLE",
    });
  });

  it("throws OCR_CONFIDENCE_TOO_LOW when all OCR results are below threshold", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    const lowConfResult = createMockOcrResult({ averageConfidence: 0.3 });
    vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(lowConfResult);
    vi.mocked(mocks.tesseractOcr.extractText).mockResolvedValue(lowConfResult);

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "OCR_CONFIDENCE_TOO_LOW",
    });
  });

  it("throws MRZ_NOT_FOUND when MRZ parsing produces no fields", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    const ocrResult = createMockOcrResult();
    vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(ocrResult);

    const emptyParse = createMrzParseResult({
      fullName: "",
      surname: "",
      givenName: "",
      passportNumber: "",
    });
    vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(emptyParse);

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "MRZ_NOT_FOUND",
    });
  });

  it("throws DOCUMENT_NOT_DETECTED when crop fails", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockRejectedValue(
      Object.assign(new Error("DOCUMENT_NOT_DETECTED"), { type: "DOCUMENT_NOT_DETECTED" }),
    );

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "DOCUMENT_NOT_DETECTED",
    });
  });

  it("calls onProgress callback during pipeline execution", async () => {
    const mocks = makeMocks();
    const onProgress = vi.fn();

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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockResolvedValue({
      imagePath: "/tmp/mrz-crop.jpg",
      width: 400,
      height: 80,
      x: 50,
      y: 480,
      detectedFormat: "TD3",
      confidence: 0.92,
    } as MrzRegion);

    vi.mocked(mocks.paddleOcr.extractText).mockResolvedValue(createMockOcrResult());
    vi.mocked(mocks.mrzParser.parseMrzLines).mockReturnValue(createMrzParseResult());
    vi.mocked(mocks.checksumValidator.validateChecksums).mockReturnValue(createChecksumValidationResult());
    vi.mocked(mocks.fieldNormalization.normalizeFields).mockReturnValue(createNormalizedFields());
    vi.mocked(mocks.confidenceService.calculateConfidence).mockReturnValue(createFieldConfidenceScores());

    const normalizedFields = createNormalizedFields();
    const confidenceScores = createFieldConfidenceScores();
    vi.mocked(mocks.staffReview.reviewResult).mockResolvedValue({
      fields: normalizedFields,
      confidence: confidenceScores,
      lowConfidenceFields: [],
      edits: {
        fullName: normalizedFields.fullName,
        firstName: normalizedFields.firstName,
        lastName: normalizedFields.lastName,
        gender: normalizedFields.gender,
        dateOfBirth: normalizedFields.dateOfBirth,
        nationality: normalizedFields.nationality,
        countryCode: normalizedFields.countryCode,
        documentType: normalizedFields.documentType,
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

    const service = createOcrPipelineService(
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

    await service.runOcrPipeline(imageInput, { onProgress });

    const stages = onProgress.mock.calls.map((c: unknown[]) => (c[0] as { stage: string }).stage);
    expect(stages).toContain("QUALITY_CHECK");
    expect(stages).toContain("DOCUMENT_CROP");
    expect(stages).toContain("PREPROCESSING");
    expect(stages).toContain("MRZ_DETECTION");
    expect(stages).toContain("OCR");
    expect(stages).toContain("MRZ_PARSE");
    expect(stages).toContain("CHECKSUM_VALIDATION");
    expect(stages).toContain("FIELD_NORMALIZATION");
    expect(stages).toContain("CONFIDENCE_SCORING");
    expect(stages).toContain("STAFF_REVIEW");
  });

  it("throws MRZ_NOT_FOUND when MRZ detection fails", async () => {
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
    } as ImageQualityResult);

    vi.mocked(mocks.documentCrop.cropDocument).mockResolvedValue({
      imagePath: "/tmp/cropped.jpg",
      width: 800,
      height: 600,
      originalWidth: 1200,
      originalHeight: 900,
      rotationAngle: 0,
    } as CroppedImage);

    vi.mocked(mocks.imagePreprocessing.preprocessImage).mockResolvedValue({
      imagePath: "/tmp/preprocessed.jpg",
      width: 800,
      height: 600,
      deskewAngle: 0,
      rotationAngle: 0,
    } as PreprocessedImage);

    vi.mocked(mocks.mrzDetection.detectMrzRegion).mockRejectedValue(
      Object.assign(new Error("MRZ_NOT_FOUND"), { type: "MRZ_NOT_FOUND" }),
    );

    const service = createOcrPipelineService(
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

    await expect(service.runOcrPipeline(imageInput)).rejects.toMatchObject({
      type: "MRZ_NOT_FOUND",
    });
  });
});
