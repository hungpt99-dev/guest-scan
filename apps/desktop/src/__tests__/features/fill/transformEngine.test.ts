import { describe, it, expect } from "vitest";
import { applyTransforms } from "../../../features/fill/transformEngine";
import type { TransformRule } from "@guestfill/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UnknownRule = { type: "unknown" } as any;

describe("transformEngine", () => {
  describe("applyTransforms", () => {
    it("applies trim transform", () => {
      const rules: TransformRule[] = [{ type: "trim" }];
      expect(applyTransforms("  hello  ", rules)).toBe("hello");
    });

    it("applies uppercase transform", () => {
      const rules: TransformRule[] = [{ type: "uppercase" }];
      expect(applyTransforms("hello", rules)).toBe("HELLO");
    });

    it("applies lowercase transform", () => {
      const rules: TransformRule[] = [{ type: "lowercase" }];
      expect(applyTransforms("HELLO", rules)).toBe("hello");
    });

    it("applies titlecase transform", () => {
      const rules: TransformRule[] = [{ type: "titlecase" }];
      expect(applyTransforms("john doe", rules)).toBe("John Doe");
    });

    it("applies date_format transform yyyy-MM-dd to dd/MM/yyyy", () => {
      const rules: TransformRule[] = [{ type: "date_format", from: "yyyy-MM-dd", to: "dd/MM/yyyy" }];
      expect(applyTransforms("2025-06-15", rules)).toBe("15/06/2025");
    });

    it("applies date_format transform yyyy-MM-dd to MM/dd/yyyy", () => {
      const rules: TransformRule[] = [{ type: "date_format", from: "yyyy-MM-dd", to: "MM/dd/yyyy" }];
      expect(applyTransforms("2025-06-15", rules)).toBe("06/15/2025");
    });

    it("applies date_format auto-detect to dd/MM/yyyy", () => {
      const rules: TransformRule[] = [{ type: "date_format", to: "dd/MM/yyyy" }];
      expect(applyTransforms("20250615", rules)).toBe("15/06/2025");
    });

    it("applies gender_format transform", () => {
      const rules: TransformRule[] = [{ type: "gender_format", mapping: { M: "Male", F: "Female" } }];
      expect(applyTransforms("M", rules)).toBe("Male");
      expect(applyTransforms("F", rules)).toBe("Female");
    });

    it("applies country_format transform ISO2 to ISO3", () => {
      const rules: TransformRule[] = [{ type: "country_format", format: "ISO3" }];
      expect(applyTransforms("VN", rules)).toBe("VNM");
      expect(applyTransforms("US", rules)).toBe("USA");
    });

    it("applies replace transform", () => {
      const rules: TransformRule[] = [{ type: "replace", from: "-", to: "/" }];
      expect(applyTransforms("2025-06-15", rules)).toBe("2025/06/15");
    });

    it("applies prefix transform", () => {
      const rules: TransformRule[] = [{ type: "prefix", value: "Mr. " }];
      expect(applyTransforms("John", rules)).toBe("Mr. John");
    });

    it("applies suffix transform", () => {
      const rules: TransformRule[] = [{ type: "suffix", value: " Jr." }];
      expect(applyTransforms("John", rules)).toBe("John Jr.");
    });

    it("applies custom_mapping transform", () => {
      const rules: TransformRule[] = [{ type: "custom_mapping", mapping: { VIP: "VVIP", NORMAL: "REGULAR" } }];
      expect(applyTransforms("VIP", rules)).toBe("VVIP");
    });

    it("applies multiple transforms in order", () => {
      const rules: TransformRule[] = [{ type: "trim" }, { type: "uppercase" }];
      expect(applyTransforms("  hello  ", rules)).toBe("HELLO");
    });

    it("returns empty string for empty input", () => {
      const rules: TransformRule[] = [{ type: "uppercase" }];
      expect(applyTransforms("", rules)).toBe("");
    });

    it("returns value unchanged for unknown rule type", () => {
      const rules = [UnknownRule];
      expect(applyTransforms("hello", rules)).toBe("hello");
    });
  });
});
