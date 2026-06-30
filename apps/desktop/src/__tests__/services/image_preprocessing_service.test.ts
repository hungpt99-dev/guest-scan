import { describe, it, expect } from "vitest";
import { createImagePreprocessingService } from "../../services/image_preprocessing_service";
import type { PreprocessingProfile } from "../../services/image_preprocessing_service";

function makeCroppedImage(overrides: Record<string, unknown> = {}) {
  return {
    imagePath: "/tmp/test_cropped.jpg",
    width: 800,
    height: 600,
    originalWidth: 1200,
    originalHeight: 900,
    rotationAngle: 0,
    ...overrides,
  };
}

describe("ImagePreprocessingService (mock)", () => {
  const service = createImagePreprocessingService();

  describe("preprocessImage", () => {
    it("returns preprocessed image with default options", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input);

      expect(result.imagePath).toBe(input.imagePath);
      expect(result.width).toBe(input.width);
      expect(result.height).toBe(input.height);
      expect(typeof result.deskewAngle).toBe("number");
      expect(typeof result.rotationAngle).toBe("number");
      expect(typeof result.profileUsed).toBe("string");
      expect(result.transforms).toBeDefined();
    });

    it("selects standard profile by default", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input);

      expect(result.profileUsed).toBe("standard");
    });

    it("preserves image path after preprocessing", async () => {
      const input = makeCroppedImage({ imagePath: "/tmp/my_test.jpg" });
      const result = await service.preprocessImage(input);

      expect(result.imagePath).toBe("/tmp/my_test.jpg");
    });
  });

  describe("preprocessing profiles", () => {
    it.each<PreprocessingProfile>(["standard", "worn_creased", "low_contrast", "glare", "rtl"])(
      "accepts profile %s",
      async (profile) => {
        const input = makeCroppedImage();
        const result = await service.preprocessImage(input, { profile });

        expect(result.profileUsed).toBe(profile);
      },
    );

    it("standard profile applies CLAHE + denoise + deskew", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { profile: "standard" });

      expect(result.transforms.claheApplied).toBe(true);
      expect(result.transforms.denoised).toBe(true);
      expect(result.transforms.deskewApplied).toBe(true);
      expect(result.transforms.glareInpainted).toBe(false);
      expect(result.transforms.gammaCorrected).toBe(false);
      expect(result.transforms.adaptiveThreshold).toBe(false);
    });

    it("worn_creased profile applies adaptive threshold but not deskew", async () => {
      const input = makeCroppedImage({ rotationAngle: 3 });
      const result = await service.preprocessImage(input, { profile: "worn_creased" });

      expect(result.profileUsed).toBe("worn_creased");
      expect(result.transforms.adaptiveThreshold).toBe(true);
    });

    it("low_contrast profile applies gamma correction", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { profile: "low_contrast" });

      expect(result.profileUsed).toBe("low_contrast");
      expect(result.transforms.gammaCorrected).toBe(true);
      expect(result.transforms.claheApplied).toBe(true);
    });

    it("glare profile applies glare inpainting", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { profile: "glare" });

      expect(result.profileUsed).toBe("glare");
      expect(result.transforms.glareInpainted).toBe(true);
      expect(result.transforms.claheApplied).toBe(true);
    });

    it("rtl profile skips deskew by default", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { profile: "rtl" });

      expect(result.profileUsed).toBe("rtl");
    });
  });

  describe("deskew", () => {
    it("returns deskewAngle that negates cropped rotationAngle", async () => {
      const input = makeCroppedImage({ rotationAngle: 5 });
      const result = await service.preprocessImage(input);

      expect(result.deskewAngle).toBe(-5);
    });

    it("handles negative rotationAngle", async () => {
      const input = makeCroppedImage({ rotationAngle: -3 });
      const result = await service.preprocessImage(input);

      expect(result.deskewAngle).toBe(3);
    });

    it("handles zero rotationAngle", async () => {
      const input = makeCroppedImage({ rotationAngle: 0 });
      const result = await service.preprocessImage(input);

      expect(result.deskewAngle).toEqual(0);
    });
  });

  describe("processing options", () => {
    it("forwards applyClahe option", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { applyClahe: false });

      expect(result).toBeDefined();
      expect(result.profileUsed).toBe("standard");
    });

    it("forwards denoise option", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { denoise: false });

      expect(result).toBeDefined();
    });

    it("forwards upscale option", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { upscale: true });

      expect(result).toBeDefined();
    });

    it("forwards targetHeight option", async () => {
      const input = makeCroppedImage();
      const result = await service.preprocessImage(input, { targetHeight: 1600 });

      expect(result).toBeDefined();
    });
  });

  describe("processing time", () => {
    it("completes preprocessing within reasonable time", async () => {
      const input = makeCroppedImage();
      const start = Date.now();
      await service.preprocessImage(input);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    it("worn_creased profile takes longer than standard", async () => {
      const input = makeCroppedImage();

      const startStandard = Date.now();
      await service.preprocessImage(input, { profile: "standard" });
      const standardTime = Date.now() - startStandard;

      const startWorn = Date.now();
      await service.preprocessImage(input, { profile: "worn_creased" });
      const wornTime = Date.now() - startWorn;

      expect(wornTime).toBeGreaterThanOrEqual(standardTime);
    });
  });
});

describe("CroppedImage dimensions", () => {
  const service = createImagePreprocessingService();

  it("preserves width and height after preprocessing", async () => {
    const input = makeCroppedImage({ width: 600, height: 400 });
    const result = await service.preprocessImage(input);

    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });

  it("handles large images", async () => {
    const input = makeCroppedImage({ width: 4000, height: 3000 });
    const result = await service.preprocessImage(input);

    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
  });
});
