import { describe, it, expect } from "vitest";
import {
  computeHorizontalProjection,
  smoothProjection,
  findTextBands,
  selectMrzBand,
  estimateLineCount,
  detectMrzFormat,
  createMrzDetectionService,
} from "../../services/mrz_detection_service";
import type { PreprocessedImage } from "../../services/image_preprocessing_service";

function makePreprocessedImage(overrides: Partial<PreprocessedImage> = {}): PreprocessedImage {
  return {
    imagePath: "/tmp/test.jpg",
    width: 800,
    height: 600,
    deskewAngle: 0,
    rotationAngle: 0,
    profileUsed: "standard",
    transforms: {
      claheApplied: false,
      denoised: false,
      deskewApplied: false,
      upscaled: false,
      rotated: false,
      glareInpainted: false,
      adaptiveThreshold: false,
      gammaCorrected: false,
    },
    ...overrides,
  };
}

describe("computeHorizontalProjection", () => {
  it("computes zero projection for all-light image", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8Array(width * height * 4).fill(255);

    const projection = computeHorizontalProjection(pixels, width, height);

    expect(projection.length).toBe(height);
    for (let y = 0; y < height; y++) {
      expect(projection[y]).toBe(0);
    }
  });

  it("computes max projection for all-dark row", () => {
    const width = 100;
    const height = 200;
    const pixels = new Uint8Array(width * height * 4).fill(255);

    for (let x = 0; x < width; x++) {
      const idx = (150 * width + x) * 4;
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 255;
    }

    const projection = computeHorizontalProjection(pixels, width, height);

    expect(projection[150]).toBe(1);
    expect(projection[0]).toBe(0);
  });

  it("computes partial projection for mixed row", () => {
    const width = 10;
    const height = 1;
    const pixels = new Uint8Array(width * height * 4).fill(255);

    for (let x = 0; x < 5; x++) {
      const idx = x * 4;
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 255;
    }

    const projection = computeHorizontalProjection(pixels, width, height);

    expect(projection[0]).toBeCloseTo(0.5, 1);
  });
});

describe("smoothProjection", () => {
  it("smoothes with moving average", () => {
    const data = new Float64Array([0, 0, 1, 0, 0, 1, 0, 0]);
    const smoothed = smoothProjection(data, 3);

    expect(smoothed[2]).toBeCloseTo(1 / 3, 2);
    expect(smoothed[0]).toBe(0);
  });

  it("handles single-element window", () => {
    const data = new Float64Array([0.5, 0.8, 0.3]);
    const smoothed = smoothProjection(data, 1);

    expect(smoothed[0]).toBe(0.5);
    expect(smoothed[1]).toBe(0.8);
  });

  it("handles empty projection", () => {
    const data = new Float64Array(0);
    const smoothed = smoothProjection(data, 3);

    expect(smoothed.length).toBe(0);
  });
});

describe("findTextBands", () => {
  it("finds a single contiguous band", () => {
    const proj = new Float64Array(100);
    for (let y = 70; y <= 85; y++) proj[y] = 0.5;

    const bands = findTextBands(proj, 0.12);

    expect(bands).toHaveLength(1);
    expect(bands[0]?.startY).toBe(70);
    expect(bands[0]?.endY).toBe(85);
    expect(bands[0]?.peakDensity).toBe(0.5);
  });

  it("finds multiple separate bands", () => {
    const proj = new Float64Array(100);
    for (let y = 10; y <= 15; y++) proj[y] = 0.5;
    for (let y = 50; y <= 55; y++) proj[y] = 0.5;

    const bands = findTextBands(proj, 0.12);

    expect(bands).toHaveLength(2);
  });

  it("returns empty array when no bands exceed threshold", () => {
    const proj = new Float64Array(100);
    const bands = findTextBands(proj, 0.12);

    expect(bands).toHaveLength(0);
  });

  it("discards single-row noise", () => {
    const proj = new Float64Array(100);
    proj[50] = 0.5;

    const bands = findTextBands(proj, 0.12);

    expect(bands).toHaveLength(0);
  });

  it("handles band at the end of projection", () => {
    const proj = new Float64Array(100);
    for (let y = 90; y <= 99; y++) proj[y] = 0.5;

    const bands = findTextBands(proj, 0.12);

    expect(bands).toHaveLength(1);
    expect(bands[0]?.startY).toBe(90);
    expect(bands[0]?.endY).toBe(99);
  });
});

describe("selectMrzBand", () => {
  it("selects the bottom-most suitable band", () => {
    const bands = [
      { startY: 50, endY: 60, peakDensity: 0.3 },
      { startY: 400, endY: 480, peakDensity: 0.5 },
    ];
    const result = selectMrzBand(bands, 600, 0.06, 0.35);

    expect(result).not.toBeNull();
    expect(result?.startY).toBe(400);
  });

  it("returns null when no band is in bottom portion", () => {
    const bands = [{ startY: 10, endY: 20, peakDensity: 0.3 }];
    const result = selectMrzBand(bands, 600, 0.06, 0.35);

    expect(result).toBeNull();
  });

  it("returns null for empty bands", () => {
    const result = selectMrzBand([], 600, 0.06, 0.35);

    expect(result).toBeNull();
  });

  it("prefers band with higher density when both are in bottom portion", () => {
    const bands = [
      { startY: 450, endY: 500, peakDensity: 0.3 },
      { startY: 400, endY: 450, peakDensity: 0.8 },
    ];
    const result = selectMrzBand(bands, 600, 0.06, 0.35);

    expect(result).not.toBeNull();
    expect(result?.peakDensity).toBe(0.8);
  });

  it("filters out bands that are too tall", () => {
    const bands = [
      { startY: 400, endY: 620, peakDensity: 0.8 },
      { startY: 420, endY: 480, peakDensity: 0.6 },
    ];
    const result = selectMrzBand(bands, 600, 0.06, 0.35);

    expect(result).not.toBeNull();
    expect(result?.peakDensity).toBe(0.6);
  });
});

describe("estimateLineCount", () => {
  it("detects 2 lines from projection peaks", () => {
    const proj = new Float64Array(200);
    for (let y = 100; y <= 115; y++) proj[y] = 0.5;
    for (let y = 130; y <= 145; y++) proj[y] = 0.5;

    const count = estimateLineCount(proj, 95, 150, 0.2, 12);

    expect(count).toBe(2);
  });

  it("detects 3 lines from projection peaks", () => {
    const proj = new Float64Array(200);
    for (let y = 80; y <= 95; y++) proj[y] = 0.5;
    for (let y = 110; y <= 125; y++) proj[y] = 0.5;
    for (let y = 140; y <= 155; y++) proj[y] = 0.5;

    const count = estimateLineCount(proj, 75, 160, 0.2, 12);

    expect(count).toBe(3);
  });

  it("returns 0 for no lines in band", () => {
    const proj = new Float64Array(200);
    const count = estimateLineCount(proj, 100, 150, 0.2, 12);

    expect(count).toBe(0);
  });

  it("ignores lines shorter than minimum height", () => {
    const proj = new Float64Array(200);
    for (let y = 100; y <= 105; y++) proj[y] = 0.5;

    const count = estimateLineCount(proj, 95, 110, 0.2, 12);

    expect(count).toBe(0);
  });
});

describe("detectMrzFormat", () => {
  it("detects TD1 for 3 lines", () => {
    const result = detectMrzFormat(3, 120, 600);

    expect(result.format).toBe("TD1");
    expect(result.lineCount).toBe(3);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("detects TD3 for 2 lines with small height ratio", () => {
    const result = detectMrzFormat(2, 50, 600);

    expect(result.format).toBe("TD3");
    expect(result.lineCount).toBe(2);
  });

  it("detects TD2 for 2 lines with larger height ratio", () => {
    const result = detectMrzFormat(2, 80, 600);

    expect(result.format).toBe("TD2");
    expect(result.lineCount).toBe(2);
  });

  it("returns UNKNOWN for single line", () => {
    const result = detectMrzFormat(1, 40, 600);

    expect(result.format).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("returns UNKNOWN for zero lines", () => {
    const result = detectMrzFormat(0, 0, 600);

    expect(result.format).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe("MockMrzDetectionService (via factory)", () => {
  it("returns MRZ region with expected structure", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage();

    const result = await service.detectMrzRegion(image);

    expect(result).toHaveProperty("imagePath");
    expect(result).toHaveProperty("boundingBox");
    expect(result).toHaveProperty("detectedFormat");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("lineCount");
    expect(result).toHaveProperty("x");
    expect(result).toHaveProperty("y");
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
  });

  it("positions MRZ at bottom of image", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage({ height: 600 });

    const result = await service.detectMrzRegion(image);

    expect(result.y).toBeGreaterThan(result.height);
    expect(result.y).toBeLessThan(image.height);
  });

  it("simulates TD3 for standard 600px image", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage({ height: 600 });

    const result = await service.detectMrzRegion(image);

    expect(result.detectedFormat).toBe("TD3");
    expect(result.lineCount).toBe(2);
  });

  it("simulates TD1 for tall 800px image", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage({ height: 800 });

    const result = await service.detectMrzRegion(image);

    expect(result.detectedFormat).toBe("TD1");
    expect(result.lineCount).toBe(3);
  });

  it("boundingBox matches x y width height", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage({ height: 600 });

    const result = await service.detectMrzRegion(image);

    expect(result.boundingBox.x).toBe(result.x);
    expect(result.boundingBox.y).toBe(result.y);
    expect(result.boundingBox.width).toBe(result.width);
    expect(result.boundingBox.height).toBe(result.height);
  });

  it("returns confidence greater than 0", async () => {
    const service = createMrzDetectionService();
    const image = makePreprocessedImage();

    const result = await service.detectMrzRegion(image);

    expect(result.confidence).toBeGreaterThan(0);
  });
});
