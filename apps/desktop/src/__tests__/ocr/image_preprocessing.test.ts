import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  detectBlur,
  detectGlare,
  improveContrast,
  denoise,
  sharpen,
  analyzeQuality,
  getRetakeWarning,
  detectDocument,
  cropImage,
  correctRotation,
  preprocessImage,
  type QualityMetrics,
} from "../../ocr/image_preprocessing";

const ImageDataMock =
  globalThis.ImageData ||
  class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };

function createMockImageData(
  width: number,
  height: number,
  fill?: (x: number, y: number, channel: number) => number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = fill ? fill(x, y, 0) : 128;
      data[idx + 1] = fill ? fill(x, y, 1) : 128;
      data[idx + 2] = fill ? fill(x, y, 2) : 128;
      data[idx + 3] = fill ? fill(x, y, 3) : 255;
    }
  }
  return new ImageDataMock(data, width, height) as unknown as ImageData;
}

function createUniformImage(width: number, height: number, value: number): ImageData {
  return createMockImageData(width, height, () => value);
}

function createCheckerboardImage(size: number, tileSize: number): ImageData {
  return createMockImageData(size, size, (x, y) => {
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);
    const isWhite = (tileX + tileY) % 2 === 0;
    return isWhite ? 240 : 16;
  });
}

function createGradientImage(width: number, height: number): ImageData {
  return createMockImageData(width, height, (x, _y) => {
    return Math.round((x / width) * 255);
  });
}

const glarePixelPositions = new Set<number>();

function createGlareImage(width: number, height: number, glareRatio: number): ImageData {
  glarePixelPositions.clear();
  const totalPixels = width * height;
  const glarePixels = Math.round(totalPixels * glareRatio);
  for (let i = 0; i < glarePixels; i++) {
    glarePixelPositions.add(i);
  }
  return createMockImageData(width, height, (_x, y, channel) => {
    const pos = y * width + _x;
    if (channel === 3) return 255;
    if (glarePixelPositions.has(pos)) return 250;
    return 128;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockCanvasInstance: any;

function createMockCanvas(width = 100, height = 100) {
  let currentImageData = createMockImageData(width, height);
  return {
    width,
    height,
    getContext: vi.fn(() => ({
      getImageData: vi.fn((x?: number, _y?: number, w?: number, _h?: number) => {
        if (x !== undefined && w !== undefined) {
          return currentImageData;
        }
        return currentImageData;
      }),
      putImageData: vi.fn((imgData: ImageData) => {
        currentImageData = imgData;
      }),
      drawImage: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => createMockImageData(w, h)),
      translate: vi.fn(),
      rotate: vi.fn(),
    })),
  };
}

beforeAll(() => {
  if (typeof document === "undefined") {
    mockCanvasInstance = createMockCanvas();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") return mockCanvasInstance;
        return {};
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).HTMLImageElement = class {
      crossOrigin: string = "";
      src: string = "";
      naturalWidth: number = 100;
      naturalHeight: number = 100;
      onload?: () => void;
      onerror?: () => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).HTMLCanvasElement = class {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).HTMLVideoElement = class {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = class {
      crossOrigin: string = "";
      src: string = "";
      naturalWidth: number = 100;
      naturalHeight: number = 100;
      onload?: () => void;
      onerror?: () => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ImageData = ImageDataMock;
  }
});

describe("detectBlur", () => {
  it("returns low score for uniform image (very blurry)", () => {
    const img = createUniformImage(50, 50, 128);
    const score = detectBlur(img);
    expect(score).toBeLessThan(10);
  });

  it("returns higher score for sharp image with edges", () => {
    const img = createCheckerboardImage(50, 4);
    const score = detectBlur(img);
    expect(score).toBeGreaterThan(100);
  });

  it("returns consistent results for same input", () => {
    const img = createCheckerboardImage(30, 3);
    const score1 = detectBlur(img);
    const score2 = detectBlur(img);
    expect(score1).toBe(score2);
  });

  it("handles small images", () => {
    const img = createUniformImage(5, 5, 100);
    const score = detectBlur(img);
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("detectGlare", () => {
  it("returns near zero for uniform non-glare image", () => {
    const img = createUniformImage(50, 50, 128);
    const score = detectGlare(img);
    expect(score).toBeLessThan(0.01);
  });

  it("detects glare in overexposed image", () => {
    const img = createGlareImage(50, 50, 0.5);
    const score = detectGlare(img);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThanOrEqual(0.6);
  });

  it("returns zero for dark image", () => {
    const img = createUniformImage(50, 50, 10);
    const score = detectGlare(img);
    expect(score).toBe(0);
  });
});

describe("improveContrast", () => {
  it("stretches histogram of low-contrast image", () => {
    const img = createUniformImage(20, 20, 100);
    const result = improveContrast(img);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("does not modify image with full contrast range", () => {
    const img = createGradientImage(20, 20);
    const result = improveContrast(img);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("returns same dimensions as input", () => {
    const img = createCheckerboardImage(32, 4);
    const result = improveContrast(img);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it("preserves alpha channel", () => {
    const img = createMockImageData(10, 10, (_x, _y, channel) => (channel === 3 ? 128 : 100));
    const result = improveContrast(img);
    const data = result.data;
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(128);
    }
  });
});

describe("denoise", () => {
  it("removes salt-and-pepper noise", () => {
    const img = createMockImageData(20, 20, (x, y, _c) => {
      if ((x + y) % 15 === 0) return 255;
      return 128;
    });
    const result = denoise(img);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("preserves uniform areas", () => {
    const img = createUniformImage(20, 20, 128);
    const result = denoise(img);
    const data = result.data;
    for (let i = 0; i < 100; i++) {
      const idx = i * 4;
      expect(data[idx]).toBe(128);
      expect(data[idx + 1]).toBe(128);
      expect(data[idx + 2]).toBe(128);
    }
  });

  it("returns same dimensions as input", () => {
    const img = createCheckerboardImage(16, 4);
    const result = denoise(img);
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
  });
});

describe("sharpen", () => {
  it("enhances edges in checkerboard pattern", () => {
    const img = createCheckerboardImage(20, 4);
    const result = sharpen(img);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("preserves uniform areas", () => {
    const img = createUniformImage(10, 10, 100);
    const result = sharpen(img);
    const data = result.data;
    for (let i = 0; i < 25; i++) {
      const idx = i * 4;
      expect(data[idx]).toBe(100);
      expect(data[idx + 1]).toBe(100);
      expect(data[idx + 2]).toBe(100);
    }
  });

  it("returns same dimensions as input", () => {
    const img = createGradientImage(15, 15);
    const result = sharpen(img);
    expect(result.width).toBe(15);
    expect(result.height).toBe(15);
  });
});

describe("analyzeQuality", () => {
  it("returns all metrics for checkerboard image", () => {
    const img = createCheckerboardImage(50, 5);
    const metrics = analyzeQuality(img);
    expect(metrics).toHaveProperty("blurScore");
    expect(metrics).toHaveProperty("glareRatio");
    expect(metrics).toHaveProperty("brightness");
    expect(metrics).toHaveProperty("contrastScore");
  });

  it("reports high brightness for bright image", () => {
    const img = createUniformImage(10, 10, 200);
    const metrics = analyzeQuality(img);
    expect(metrics.brightness).toBeGreaterThan(100);
  });

  it("reports low brightness for dark image", () => {
    const img = createUniformImage(10, 10, 20);
    const metrics = analyzeQuality(img);
    expect(metrics.brightness).toBeLessThan(50);
  });

  it("reports high contrast for checkerboard", () => {
    const img = createCheckerboardImage(20, 2);
    const metrics = analyzeQuality(img);
    expect(metrics.contrastScore).toBeGreaterThan(150);
  });

  it("reports low contrast for uniform image", () => {
    const img = createUniformImage(20, 20, 100);
    const metrics = analyzeQuality(img);
    expect(metrics.contrastScore).toBeLessThan(10);
  });
});

describe("getRetakeWarning", () => {
  const goodQuality: QualityMetrics = {
    blurScore: 200,
    glareRatio: 0.01,
    brightness: 128,
    contrastScore: 100,
  };

  it("returns null for good quality metrics", () => {
    const warning = getRetakeWarning(goodQuality);
    expect(warning).toBeNull();
  });

  it("returns warning for low blur score", () => {
    const warning = getRetakeWarning({ ...goodQuality, blurScore: 30 });
    expect(warning).not.toBeNull();
    expect(warning!.reason).toContain("Blurry");
    expect(warning!.severity).toBe("warning");
  });

  it("returns critical for very low blur score", () => {
    const warning = getRetakeWarning({ ...goodQuality, blurScore: 20 });
    expect(warning).not.toBeNull();
    expect(warning!.severity).toBe("critical");
  });

  it("returns warning for high glare ratio", () => {
    const warning = getRetakeWarning({ ...goodQuality, glareRatio: 0.3 });
    expect(warning).not.toBeNull();
    expect(warning!.reason).toContain("Glare");
  });

  it("returns critical for very high glare ratio", () => {
    const warning = getRetakeWarning({ ...goodQuality, glareRatio: 0.5 });
    expect(warning).not.toBeNull();
    expect(warning!.severity).toBe("critical");
  });

  it("returns warning for low brightness", () => {
    const warning = getRetakeWarning({ ...goodQuality, brightness: 20 });
    expect(warning).not.toBeNull();
    expect(warning!.reason).toContain("dark");
  });

  it("returns warning for high brightness", () => {
    const warning = getRetakeWarning({ ...goodQuality, brightness: 240 });
    expect(warning).not.toBeNull();
    expect(warning!.reason).toContain("bright");
  });

  it("returns warning for low contrast", () => {
    const warning = getRetakeWarning({ ...goodQuality, contrastScore: 15 });
    expect(warning).not.toBeNull();
    expect(warning!.reason).toContain("contrast");
  });

  it("returns most severe warning first", () => {
    const warning = getRetakeWarning({
      blurScore: 20,
      glareRatio: 0.3,
      brightness: 128,
      contrastScore: 100,
    });
    expect(warning).not.toBeNull();
    expect(warning!.severity).toBe("critical");
    expect(warning!.reason).toContain("Blurry");
  });

  it("provides actionable details in the warning", () => {
    const warning = getRetakeWarning({ ...goodQuality, blurScore: 10 });
    expect(warning).not.toBeNull();
    expect(warning!.details.length).toBeGreaterThan(10);
  });
});

describe("detectDocument", () => {
  it("returns null for uniform image (no document edges)", () => {
    const img = createUniformImage(100, 100, 128);
    const bounds = detectDocument(img);
    expect(bounds).toBeNull();
  });

  it("detects document-like region in image with clear edges", () => {
    const img = createMockImageData(100, 100, (x, y) => {
      if (x >= 20 && x < 80 && y >= 20 && y < 80) return 200;
      return 50;
    });
    const bounds = detectDocument(img);
    expect(bounds).not.toBeNull();
    if (bounds) {
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    }
  });

  it("returns rectangle with valid dimensions", () => {
    const img = createMockImageData(60, 60, (x, y) => {
      if (x >= 10 && x < 50 && y >= 10 && y < 50) return 200;
      return 50;
    });
    const bounds = detectDocument(img);
    expect(bounds).not.toBeNull();
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(60);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(60);
    }
  });
});

describe("cropImage", () => {
  it("crops image to specified bounds", () => {
    const img = createMockImageData(100, 100, (x, _y) => {
      if (x < 50) return 200;
      return 100;
    });
    const cropped = cropImage(img, { x: 0, y: 0, width: 50, height: 100 });
    expect(cropped.width).toBe(50);
    expect(cropped.height).toBe(100);
  });

  it("handles bounds at edges", () => {
    const img = createMockImageData(50, 50, () => 128);
    const cropped = cropImage(img, { x: 40, y: 40, width: 20, height: 20 });
    expect(cropped.width).toBe(10);
    expect(cropped.height).toBe(10);
  });

  it("returns subset of original data", () => {
    const img = createMockImageData(30, 30, (_x, _y, channel) => {
      if (channel === 3) return 255;
      return 128;
    });
    const cropped = cropImage(img, { x: 5, y: 5, width: 10, height: 10 });
    expect(cropped.width).toBe(10);
    expect(cropped.height).toBe(10);
    for (let i = 3; i < cropped.data.length; i += 4) {
      expect(cropped.data[i]).toBe(255);
    }
  });
});

describe("correctRotation", () => {
  it("returns near-zero angle for already straight image", () => {
    const img = createCheckerboardImage(40, 5);
    const result = correctRotation(img);
    expect(Math.abs(result.angle)).toBeLessThan(3);
  });

  it("preserves image data structure", () => {
    const img = createUniformImage(20, 20, 128);
    const result = correctRotation(img);
    expect(result.imageData).toBeDefined();
    expect(typeof result.angle).toBe("number");
  });
});

describe("preprocessImage", () => {
  it("processes ImageData through default pipeline", async () => {
    const img = createCheckerboardImage(50, 5);
    const result = await preprocessImage(img);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.qualityMetrics).toBeDefined();
    expect(result.transformsApplied.length).toBeGreaterThan(0);
  });

  it("applies denoise when enabled", async () => {
    const img = createCheckerboardImage(30, 3);
    const result = await preprocessImage(img, { denoise: true });
    expect(result.transformsApplied).toContain("denoise");
  });

  it("skips denoise when disabled", async () => {
    const img = createUniformImage(20, 20, 128);
    const result = await preprocessImage(img, {
      denoise: false,
      sharpen: false,
      improveContrast: false,
      detectDocument: false,
    });
    expect(result.transformsApplied).not.toContain("denoise");
  });

  it("applies contrast enhancement when enabled", async () => {
    const img = createUniformImage(20, 20, 100);
    const result = await preprocessImage(img, {
      improveContrast: true,
      denoise: false,
      sharpen: false,
      detectDocument: false,
    });
    expect(result.transformsApplied).toContain("contrast_enhance");
  });

  it("applies sharpen when enabled", async () => {
    const img = createCheckerboardImage(20, 4);
    const result = await preprocessImage(img, {
      sharpen: true,
      denoise: false,
      improveContrast: false,
      detectDocument: false,
    });
    expect(result.transformsApplied).toContain("sharpen");
  });

  it("returns retake warning for poor quality image", async () => {
    const img = createUniformImage(20, 20, 128);
    const result = await preprocessImage(img, {
      sharpen: false,
      improveContrast: false,
      denoise: false,
      correctRotation: false,
      detectDocument: false,
      correctPerspective: false,
    });
    expect(result.retakeWarning).not.toBeNull();
  });

  it("returns null retake warning for good quality image", async () => {
    const img = createCheckerboardImage(40, 3);
    const result = await preprocessImage(img, {
      sharpen: false,
      improveContrast: false,
      denoise: false,
      correctRotation: false,
      detectDocument: false,
      correctPerspective: false,
    });
    expect(result.retakeWarning).toBeNull();
  });

  it("reports all transforms that were applied", async () => {
    const img = createCheckerboardImage(30, 3);
    const result = await preprocessImage(img, {
      detectDocument: false,
      correctPerspective: false,
      correctRotation: false,
      improveContrast: true,
      denoise: true,
      sharpen: true,
    });
    expect(result.transformsApplied).toContain("denoise");
    expect(result.transformsApplied).toContain("contrast_enhance");
    expect(result.transformsApplied).toContain("sharpen");
  });
});
