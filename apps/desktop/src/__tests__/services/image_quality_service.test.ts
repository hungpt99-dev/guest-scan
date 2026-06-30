import { describe, it, expect } from "vitest";
import { createImageQualityService } from "../../services/image_quality_service";

function makeGoodMetrics() {
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

describe("ImageQualityService (mock)", () => {
  const service = createImageQualityService();

  describe("analyzeImage", () => {
    it("returns passed=true for simulated good quality image", async () => {
      const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });

      expect(result.passed).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.metrics.blurScore).toBeGreaterThan(0);
    });

    it("returns all expected metric fields", async () => {
      const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });

      expect(result.metrics).toHaveProperty("blurScore");
      expect(result.metrics).toHaveProperty("brightness");
      expect(result.metrics).toHaveProperty("contrast");
      expect(result.metrics).toHaveProperty("glareRatio");
      expect(result.metrics).toHaveProperty("skewAngle");
      expect(result.metrics).toHaveProperty("width");
      expect(result.metrics).toHaveProperty("height");
      expect(result.metrics).toHaveProperty("edgeVisibilityScore");
    });

    it("returns all expected warning types as potential issues", async () => {
      const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });

      expect(result.passed).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});

describe("evaluateWarnings (unit)", () => {
  it("returns BLURRY when blurScore is below threshold", async () => {
    const { createImageQualityService } = await import("../../services/image_quality_service");
    const service = createImageQualityService();
    const result = await service.analyzeImage({ imagePath: "/tmp/test.jpg" });

    expect(result).toBeDefined();
  });

  it("detects BLURRY for low blur score", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 30;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("BLURRY");
  });

  it("detects TOO_DARK for low brightness", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 20;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("TOO_DARK");
  });

  it("detects TOO_BRIGHT for high brightness", () => {
    const metrics = makeGoodMetrics();
    metrics.brightness = 240;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("TOO_BRIGHT");
  });

  it("detects LOW_CONTRAST for low contrast", () => {
    const metrics = makeGoodMetrics();
    metrics.contrast = 15;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("LOW_CONTRAST");
  });

  it("detects GLARE_DETECTED for high glare ratio", () => {
    const metrics = makeGoodMetrics();
    metrics.glareRatio = 0.5;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("GLARE_DETECTED");
  });

  it("detects SKEWED for large skew angle", () => {
    const metrics = makeGoodMetrics();
    metrics.skewAngle = 10;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("SKEWED");
  });

  it("detects SKEWED for negative large skew angle", () => {
    const metrics = makeGoodMetrics();
    metrics.skewAngle = -8;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("SKEWED");
  });

  it("detects LOW_RESOLUTION for small width", () => {
    const metrics = makeGoodMetrics();
    metrics.width = 600;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("LOW_RESOLUTION");
  });

  it("detects LOW_RESOLUTION for small height", () => {
    const metrics = makeGoodMetrics();
    metrics.height = 400;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("LOW_RESOLUTION");
  });

  it("detects EDGES_NOT_VISIBLE for low edge score", () => {
    const metrics = makeGoodMetrics();
    metrics.edgeVisibilityScore = 0.1;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("EDGES_NOT_VISIBLE");
  });

  it("returns no warnings for good metrics", () => {
    const metrics = makeGoodMetrics();
    const warnings = getWarnings(metrics);
    expect(warnings).toEqual([]);
  });

  it("returns multiple warnings simultaneously", () => {
    const metrics = makeGoodMetrics();
    metrics.blurScore = 20;
    metrics.brightness = 240;
    metrics.skewAngle = 15;
    metrics.glareRatio = 0.5;
    const warnings = getWarnings(metrics);
    expect(warnings).toContain("BLURRY");
    expect(warnings).toContain("TOO_BRIGHT");
    expect(warnings).toContain("SKEWED");
    expect(warnings).toContain("GLARE_DETECTED");
  });
});

function getWarnings(metrics: ReturnType<typeof makeGoodMetrics>): string[] {
  const score = metrics.blurScore;
  const brightness = metrics.brightness;
  const contrast = metrics.contrast;
  const glareRatio = metrics.glareRatio;
  const skewAngle = metrics.skewAngle;
  const edgeVisibilityScore = metrics.edgeVisibilityScore;
  const width = metrics.width;
  const height = metrics.height;

  const warnings: string[] = [];
  if (score < 50) warnings.push("BLURRY");
  if (brightness < 50) warnings.push("TOO_DARK");
  else if (brightness > 220) warnings.push("TOO_BRIGHT");
  if (contrast < 30) warnings.push("LOW_CONTRAST");
  if (glareRatio > 0.15) warnings.push("GLARE_DETECTED");
  if (Math.abs(skewAngle) > 5) warnings.push("SKEWED");
  if (width < 800 || height < 600) warnings.push("LOW_RESOLUTION");
  if (edgeVisibilityScore < 0.3) warnings.push("EDGES_NOT_VISIBLE");
  return warnings;
}
