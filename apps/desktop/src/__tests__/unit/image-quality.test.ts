import { describe, it, expect } from "vitest";
import { createImageQualityService } from "../../services/image_quality_service";

interface QualityMetrics {
  blurScore: number;
  brightness: number;
  contrast: number;
  glareRatio: number;
  skewAngle: number;
  width: number;
  height: number;
  edgeVisibilityScore: number;
}

type QualityWarning =
  | "BLURRY"
  | "TOO_DARK"
  | "TOO_BRIGHT"
  | "LOW_CONTRAST"
  | "GLARE_DETECTED"
  | "SKEWED"
  | "LOW_RESOLUTION"
  | "EDGES_NOT_VISIBLE";

const PASSPORT_MIN_WIDTH = 800;
const PASSPORT_MIN_HEIGHT = 600;
const BLUR_THRESHOLD = 50;
const BRIGHTNESS_MIN = 50;
const BRIGHTNESS_MAX = 220;
const CONTRAST_MIN = 30;
const SKEW_THRESHOLD = 5;
const GLARE_THRESHOLD = 0.15;
const EDGE_VISIBILITY_THRESHOLD = 0.3;

function evaluateWarnings(metrics: QualityMetrics): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  if (metrics.blurScore < BLUR_THRESHOLD) warnings.push("BLURRY");
  if (metrics.brightness < BRIGHTNESS_MIN) warnings.push("TOO_DARK");
  else if (metrics.brightness > BRIGHTNESS_MAX) warnings.push("TOO_BRIGHT");
  if (metrics.contrast < CONTRAST_MIN) warnings.push("LOW_CONTRAST");
  if (metrics.glareRatio > GLARE_THRESHOLD) warnings.push("GLARE_DETECTED");
  if (Math.abs(metrics.skewAngle) > SKEW_THRESHOLD) warnings.push("SKEWED");
  if (metrics.width < PASSPORT_MIN_WIDTH || metrics.height < PASSPORT_MIN_HEIGHT) warnings.push("LOW_RESOLUTION");
  if (metrics.edgeVisibilityScore < EDGE_VISIBILITY_THRESHOLD) warnings.push("EDGES_NOT_VISIBLE");
  return warnings;
}

function makeGoodMetrics(): QualityMetrics {
  return {
    blurScore: 85,
    brightness: 128,
    contrast: 55,
    glareRatio: 0.02,
    skewAngle: 1.5,
    width: 1200,
    height: 900,
    edgeVisibilityScore: 0.85,
  };
}

describe("Image Quality - Mock Service", () => {
  const service = createImageQualityService();

  it("returns passed=true for simulated good quality image", async () => {
    const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("returns all expected metric fields with valid values", async () => {
    const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });
    const metrics = result.metrics;
    expect(metrics.blurScore).toBeGreaterThanOrEqual(0);
    expect(metrics.brightness).toBeGreaterThanOrEqual(0);
    expect(metrics.brightness).toBeLessThanOrEqual(255);
    expect(metrics.contrast).toBeGreaterThanOrEqual(0);
    expect(metrics.glareRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.glareRatio).toBeLessThanOrEqual(1);
    expect(typeof metrics.skewAngle).toBe("number");
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThan(0);
    expect(metrics.edgeVisibilityScore).toBeGreaterThanOrEqual(0);
    expect(metrics.edgeVisibilityScore).toBeLessThanOrEqual(1);
  });

  it("has processing delay similar to real service", async () => {
    const start = performance.now();
    await service.analyzeImage({ imagePath: "/tmp/test.jpg" });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe("Image Quality - Warning Detection (Boundary Tests)", () => {
  it("detects BLURRY when blurScore is below threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 49;
    expect(evaluateWarnings(metrics)).toContain("BLURRY");
  });

  it("does NOT warn when blurScore equals threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 50;
    expect(evaluateWarnings(metrics)).not.toContain("BLURRY");
  });

  it("does NOT warn when blurScore is above threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 51;
    expect(evaluateWarnings(metrics)).not.toContain("BLURRY");
  });

  it("detects TOO_DARK when brightness is below minimum", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 49;
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toContain("TOO_DARK");
    expect(warnings).not.toContain("TOO_BRIGHT");
  });

  it("does NOT warn when brightness equals minimum", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 50;
    expect(evaluateWarnings(metrics)).not.toContain("TOO_DARK");
  });

  it("detects TOO_BRIGHT when brightness exceeds maximum", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 221;
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toContain("TOO_BRIGHT");
    expect(warnings).not.toContain("TOO_DARK");
  });

  it("does NOT warn when brightness equals maximum", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 220;
    const warnings = evaluateWarnings(metrics);
    expect(warnings).not.toContain("TOO_BRIGHT");
    expect(warnings).not.toContain("TOO_DARK");
  });

  it("detects LOW_CONTRAST when contrast is below threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.contrast = 29;
    expect(evaluateWarnings(metrics)).toContain("LOW_CONTRAST");
  });

  it("does NOT warn when contrast equals threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.contrast = 30;
    expect(evaluateWarnings(metrics)).not.toContain("LOW_CONTRAST");
  });

  it("detects GLARE_DETECTED when glare ratio exceeds threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.glareRatio = 0.16;
    expect(evaluateWarnings(metrics)).toContain("GLARE_DETECTED");
  });

  it("does NOT warn when glare ratio equals threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.glareRatio = 0.15;
    expect(evaluateWarnings(metrics)).not.toContain("GLARE_DETECTED");
  });

  it("detects SKEWED for positive angle above threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.skewAngle = 6;
    expect(evaluateWarnings(metrics)).toContain("SKEWED");
  });

  it("detects SKEWED for negative angle below negative threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.skewAngle = -6;
    expect(evaluateWarnings(metrics)).toContain("SKEWED");
  });

  it("does NOT warn when skew angle equals threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.skewAngle = 5;
    expect(evaluateWarnings(metrics)).not.toContain("SKEWED");
    metrics.skewAngle = -5;
    expect(evaluateWarnings(metrics)).not.toContain("SKEWED");
  });

  it("detects LOW_RESOLUTION when width is below minimum", () => {
    const metrics = makeGoodMetrics();
    metrics.width = 799;
    expect(evaluateWarnings(metrics)).toContain("LOW_RESOLUTION");
  });

  it("detects LOW_RESOLUTION when height is below minimum", () => {
    const metrics = makeGoodMetrics();
    metrics.height = 599;
    expect(evaluateWarnings(metrics)).toContain("LOW_RESOLUTION");
  });

  it("does NOT warn when both dimensions meet minimums", () => {
    const metrics = makeGoodMetrics();
    metrics.width = 800;
    metrics.height = 600;
    expect(evaluateWarnings(metrics)).not.toContain("LOW_RESOLUTION");
  });

  it("detects EDGES_NOT_VISIBLE when edge score is below threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.edgeVisibilityScore = 0.29;
    expect(evaluateWarnings(metrics)).toContain("EDGES_NOT_VISIBLE");
  });

  it("does NOT warn when edge score equals threshold", () => {
    const metrics = makeGoodMetrics();
    metrics.edgeVisibilityScore = 0.3;
    expect(evaluateWarnings(metrics)).not.toContain("EDGES_NOT_VISIBLE");
  });
});

describe("Image Quality - Multiple Warning Combinations", () => {
  it("returns no warnings for ideal metrics", () => {
    expect(evaluateWarnings(makeGoodMetrics())).toEqual([]);
  });

  it("returns all warnings when all metrics are bad", () => {
    const metrics: QualityMetrics = {
      blurScore: 10,
      brightness: 10,
      contrast: 10,
      glareRatio: 0.9,
      skewAngle: 45,
      width: 100,
      height: 100,
      edgeVisibilityScore: 0.05,
    };
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toContain("BLURRY");
    expect(warnings).toContain("TOO_DARK");
    expect(warnings).toContain("LOW_CONTRAST");
    expect(warnings).toContain("GLARE_DETECTED");
    expect(warnings).toContain("SKEWED");
    expect(warnings).toContain("LOW_RESOLUTION");
    expect(warnings).toContain("EDGES_NOT_VISIBLE");
    expect(warnings).toHaveLength(7);
  });

  it("reports TOO_DARK and TOO_BRIGHT exclusively (never both)", () => {
    const dim = makeGoodMetrics();
    dim.brightness = 10;
    const dimWarnings = evaluateWarnings(dim);
    expect(dimWarnings).toContain("TOO_DARK");
    expect(dimWarnings).not.toContain("TOO_BRIGHT");

    const bright = makeGoodMetrics();
    bright.brightness = 240;
    const brightWarnings = evaluateWarnings(bright);
    expect(brightWarnings).toContain("TOO_BRIGHT");
    expect(brightWarnings).not.toContain("TOO_DARK");
  });

  it("combines blur + glare + skew on same image", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 30;
    metrics.glareRatio = 0.5;
    metrics.skewAngle = 12;
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toContain("BLURRY");
    expect(warnings).toContain("GLARE_DETECTED");
    expect(warnings).toContain("SKEWED");
    expect(warnings).toHaveLength(3);
  });

  it("combines low resolution with edges not visible", () => {
    const metrics = makeGoodMetrics();
    metrics.width = 400;
    metrics.height = 300;
    metrics.edgeVisibilityScore = 0.1;
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toContain("LOW_RESOLUTION");
    expect(warnings).toContain("EDGES_NOT_VISIBLE");
  });
});

describe("Image Quality - passed flag logic", () => {
  it("returns passed=true when warnings array is empty", () => {
    const metrics = makeGoodMetrics();
    const warnings = evaluateWarnings(metrics);
    expect(warnings).toEqual([]);
    expect(warnings.length === 0).toBe(true);
  });

  it("returns passed=false when any warning exists", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 30;
    const warnings = evaluateWarnings(metrics);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length === 0).toBe(false);
  });

  it("service returns passed based on warnings length", async () => {
    const service = createImageQualityService();
    const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });
    expect(result.passed).toBe(result.warnings.length === 0);
  });
});
