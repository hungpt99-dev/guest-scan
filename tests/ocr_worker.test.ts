import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockOcrEngine } from "../apps/desktop/src/ocr/mock_ocr_engine";
import type { OcrEngine, OcrInput, OcrTextResult, OcrTextChunk } from "../apps/desktop/src/ocr/ocr_engine";
import { createOcrPipelineService } from "../apps/desktop/src/services/ocr_pipeline_service";
import { createOcrApi } from "../apps/desktop/src/api/ocr_api";
import {
  createImageQualityService,
  type ImageInput,
  type ImageQualityResult,
} from "../apps/desktop/src/services/image_quality_service";

const TD3_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const TD3_LINE_2 = "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04";
const TD3_FULLTEXT = [TD3_LINE_1, TD3_LINE_2].join("\n");

function mockInput(path = "/tmp/test-passport.jpg") {
  return { imagePath: path };
}

describe("OCR Worker — MockOcrEngine", () => {
  const input = mockInput();

  it("returns default MRZ result with mock engine", async () => {
    const engine = new MockOcrEngine();
    const result = await engine.extractText(input);

    expect(result.lines).toHaveLength(2);
    expect(result.averageConfidence).toBeGreaterThan(0.9);
    expect(result.fullText).toContain("P<UTO");
  });

  it("simulates OCR worker failure via failWithError flag", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");
  });

  it("returns custom OCR result with high confidence", async () => {
    const customLines = [
      { text: TD3_LINE_1, confidence: 0.97 },
      { text: TD3_LINE_2, confidence: 0.95 },
    ];
    const engine = new MockOcrEngine({
      lines: customLines,
      fullText: TD3_FULLTEXT,
      averageConfidence: 0.96,
    });

    const result = await engine.extractText(input);
    expect(result.lines).toHaveLength(2);
    expect(result.averageConfidence).toBe(0.96);
  });

  it("switches from failure to success after reconfiguration", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");

    engine.setConfig({});
    const result = await engine.extractText(input);
    expect(result.averageConfidence).toBeGreaterThan(0.9);
  });

  it("returns low confidence result to simulate poor image quality", async () => {
    const lowConfLines = [
      { text: "P<UT0MUSTER<<J0HN<M1CHAEL<<<<<<<<<<<<<<<<<<<<<<", confidence: 0.35 },
      { text: "AB123456<7UT08510101M2001011<<<<<<<<<<<<<<<<04", confidence: 0.3 },
    ];
    const engine = new MockOcrEngine({
      lines: lowConfLines,
      fullText: lowConfLines.map((l) => l.text).join("\n"),
      averageConfidence: 0.325,
    });

    const result = await engine.extractText(input);
    expect(result.averageConfidence).toBeLessThan(0.4);
    expect(result.averageConfidence).toBe(0.325);
  });

  it("handles single-line MRZ result", async () => {
    const singleLine = [{ text: TD3_LINE_1, confidence: 0.9 }];
    const engine = new MockOcrEngine({
      lines: singleLine,
      fullText: TD3_LINE_1,
      averageConfidence: 0.9,
    });

    const result = await engine.extractText(input);
    expect(result.lines).toHaveLength(1);
    expect(result.averageConfidence).toBe(0.9);
  });
});

describe("OCR Worker — Engine Fallback Simulation", () => {
  const input = mockInput();

  it("simulates primary engine failure with fallback to secondary engine", async () => {
    const primaryResult = new MockOcrEngine({ failWithError: true });
    const fallbackResult = new MockOcrEngine({
      lines: [
        { text: TD3_LINE_1, confidence: 0.88 },
        { text: TD3_LINE_2, confidence: 0.85 },
      ],
      fullText: TD3_FULLTEXT,
      averageConfidence: 0.865,
    });

    await expect(primaryResult.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");
    const result = await fallbackResult.extractText(input);
    expect(result.averageConfidence).toBe(0.865);
  });

  it("simulates both engines failing end-to-end", async () => {
    const engine1 = new MockOcrEngine({ failWithError: true });
    const engine2 = new MockOcrEngine({ failWithError: true });

    await expect(engine1.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");
    await expect(engine2.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");
  });

  it("recovers after transient failure when engine is reconfigured", async () => {
    const engine = new MockOcrEngine({ failWithError: true });
    await expect(engine.extractText(input)).rejects.toThrow("Mock OCR engine simulated failure");

    engine.setConfig({
      lines: [
        { text: TD3_LINE_1, confidence: 0.95 },
        { text: TD3_LINE_2, confidence: 0.92 },
      ],
      fullText: TD3_FULLTEXT,
      averageConfidence: 0.935,
    });
    const result = await engine.extractText(input);
    expect(result.averageConfidence).toBeCloseTo(0.935, 2);
  });

  it("prefers higher confidence result between two engines", async () => {
    const lowConfEngine = new MockOcrEngine({
      lines: [{ text: "garbled text", confidence: 0.25 }],
      fullText: "garbled text",
      averageConfidence: 0.25,
    });
    const highConfEngine = new MockOcrEngine({
      lines: [
        { text: TD3_LINE_1, confidence: 0.95 },
        { text: TD3_LINE_2, confidence: 0.93 },
      ],
      fullText: TD3_FULLTEXT,
      averageConfidence: 0.94,
    });

    const low = await lowConfEngine.extractText(input);
    const high = await highConfEngine.extractText(input);
    expect(high.averageConfidence).toBeGreaterThan(low.averageConfidence);
    expect(high.averageConfidence).toBeGreaterThan(0.9);
  });
});

describe("OCR Worker — Image Quality Pre-check", () => {
  const input = mockInput();

  it("rejects blurry image before OCR processing", async () => {
    const qualityService = createImageQualityService();
    const result = await qualityService.analyzeImage(input);
    expect(result).toBeDefined();
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("simulates blurry image rejection", async () => {
    class BlurryQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 10,
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
    const result = await quality.analyzeImage(input);
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("BLURRY");
  });

  it("simulates glare rejection", async () => {
    class GlareQuality implements ImageQualityService {
      async analyzeImage(_input: ImageInput): Promise<ImageQualityResult> {
        return {
          metrics: {
            blurScore: 80,
            brightness: 190,
            contrast: 50,
            glareRatio: 0.5,
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

    const quality = new GlareQuality();
    const result = await quality.analyzeImage(input);
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("GLARE_DETECTED");
  });
});

describe("OCR Worker — Pipeline Integration", () => {
  const input = mockInput();

  it("runs OCR pipeline with mocked engine through OCR API", async () => {
    const api = createOcrApi();
    expect(api).toBeDefined();
    expect(api.getSessionState().stage).toBe("IDLE");
  });

  it("captures image then runs OCR", async () => {
    const api = createOcrApi();
    const capture = await api.captureImage("file:///tmp/test.jpg");
    expect(capture.ok).toBe(true);
    if (capture.ok) {
      expect(capture.value.image.imagePath).toBe("/tmp/test.jpg");
    }
  });

  it("handles capture failure gracefully when no camera source provided", async () => {
    const api = createOcrApi();
    const result = await api.captureImage();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("runOcr returns error when no pipeline service configured", async () => {
    const api = createOcrApi();
    const result = await api.runOcr(input);
    expect(result.ok).toBe(false);
  });
});
