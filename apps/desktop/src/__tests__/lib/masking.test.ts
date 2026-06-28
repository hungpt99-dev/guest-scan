import { describe, it, expect } from "vitest";
import { maskString, maskPassportNumber, maskIdNumber, maskFullName } from "@guestfill/shared";

describe("masking", () => {
  describe("maskString", () => {
    it("masks characters after visible start", () => {
      expect(maskString("ABCD1234")).toBe("ABCD****");
    });

    it("returns full string if shorter than visible start", () => {
      expect(maskString("AB")).toBe("AB");
    });

    it("handles empty string", () => {
      expect(maskString("")).toBe("");
    });

    it("uses custom mask character", () => {
      expect(maskString("ABCD1234", 4, "#")).toBe("ABCD####");
    });
  });

  describe("maskPassportNumber", () => {
    it("masks passport number keeping first 4 chars", () => {
      expect(maskPassportNumber("AB123456")).toBe("AB12****");
    });

    it("masks shorter passport number", () => {
      expect(maskPassportNumber("AB123")).toBe("AB12*");
    });
  });

  describe("maskIdNumber", () => {
    it("masks ID number keeping first 4 chars", () => {
      expect(maskIdNumber("123456789")).toBe("1234*****");
    });
  });

  describe("maskFullName", () => {
    it("masks last name keeping first character", () => {
      expect(maskFullName("John Doe")).toBe("John D**");
    });

    it("handles single name", () => {
      expect(maskFullName("John")).toBe("J***");
    });

    it("handles multiple parts", () => {
      expect(maskFullName("John Michael Doe")).toBe("John Michael D**");
    });
  });
});
