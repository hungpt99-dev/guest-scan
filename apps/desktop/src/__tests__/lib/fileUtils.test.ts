import { describe, it, expect } from "vitest";
import { getFileExtension, isImageFile, isPdfFile, isSupportedFile, generateFileName } from "../../lib/fileUtils";

describe("fileUtils", () => {
  describe("getFileExtension", () => {
    it("returns extension from filename", () => {
      expect(getFileExtension("photo.jpg")).toBe(".jpg");
    });

    it("returns extension in lowercase", () => {
      expect(getFileExtension("photo.JPG")).toBe(".jpg");
    });

    it("returns empty string for no extension", () => {
      expect(getFileExtension("photo")).toBe("");
    });

    it("handles multiple dots", () => {
      expect(getFileExtension("photo.backup.png")).toBe(".png");
    });
  });

  describe("isImageFile", () => {
    it("returns true for jpg", () => {
      expect(isImageFile("photo.jpg")).toBe(true);
    });

    it("returns true for png", () => {
      expect(isImageFile("photo.png")).toBe(true);
    });

    it("returns false for pdf", () => {
      expect(isImageFile("doc.pdf")).toBe(false);
    });

    it("returns false for no extension", () => {
      expect(isImageFile("photo")).toBe(false);
    });
  });

  describe("isPdfFile", () => {
    it("returns true for pdf", () => {
      expect(isPdfFile("doc.pdf")).toBe(true);
    });

    it("returns false for image", () => {
      expect(isPdfFile("photo.jpg")).toBe(false);
    });
  });

  describe("isSupportedFile", () => {
    it("returns true for image", () => {
      expect(isSupportedFile("photo.jpg")).toBe(true);
    });

    it("returns true for pdf", () => {
      expect(isSupportedFile("doc.pdf")).toBe(true);
    });

    it("returns false for unsupported", () => {
      expect(isSupportedFile("doc.txt")).toBe(false);
    });
  });

  describe("generateFileName", () => {
    it("generates file name with prefix and extension", () => {
      const name = generateFileName("output", ".xlsx");
      expect(name).toMatch(/^output_\d{4}-\d{2}-\d{2}T.*\.xlsx$/);
    });
  });
});
