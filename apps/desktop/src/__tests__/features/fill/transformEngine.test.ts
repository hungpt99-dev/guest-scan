import { describe, it, expect } from "vitest";
import { applyTransforms } from "../../../features/fill/transformEngine";
import type { TransformRule } from "@guestfill/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UnknownRule = { type: "unknown" } as any;

describe("transformEngine", () => {
  describe("applyTransforms", () => {
    describe("date_format additional conversions", () => {
      it("converts dd/MM/yyyy to yyyy-MM-dd", () => {
        const rules: TransformRule[] = [{ type: "date_format", from: "dd/MM/yyyy", to: "yyyy-MM-dd" }];
        expect(applyTransforms("15/06/2025", rules)).toBe("2025-06-15");
      });

      it("converts MM/dd/yyyy to yyyy-MM-dd", () => {
        const rules: TransformRule[] = [{ type: "date_format", from: "MM/dd/yyyy", to: "yyyy-MM-dd" }];
        expect(applyTransforms("06/15/2025", rules)).toBe("2025-06-15");
      });

      it("converts dd/MM/yyyy to MM/dd/yyyy", () => {
        const rules: TransformRule[] = [{ type: "date_format", from: "dd/MM/yyyy", to: "MM/dd/yyyy" }];
        expect(applyTransforms("15/06/2025", rules)).toBe("06/15/2025");
      });

      it("converts yyyyMMdd to dd/MM/yyyy", () => {
        const rules: TransformRule[] = [{ type: "date_format", from: "yyyyMMdd", to: "dd/MM/yyyy" }];
        expect(applyTransforms("20250615", rules)).toBe("15/06/2025");
      });

      it("converts yyyyMMdd to yyyy-MM-dd", () => {
        const rules: TransformRule[] = [{ type: "date_format", from: "yyyyMMdd", to: "yyyy-MM-dd" }];
        expect(applyTransforms("20250615", rules)).toBe("2025-06-15");
      });

      it("auto-detects compact format to yyyy-MM-dd", () => {
        const rules: TransformRule[] = [{ type: "date_format", to: "yyyy-MM-dd" }];
        expect(applyTransforms("20250615", rules)).toBe("2025-06-15");
      });
    });

    describe("strip transform", () => {
      it("removes non-alphanumeric characters by default", () => {
        const rules: TransformRule[] = [{ type: "strip" }];
        expect(applyTransforms("AB-123 456!", rules)).toBe("AB123456");
      });

      it("removes specified characters", () => {
        const rules: TransformRule[] = [{ type: "strip", chars: "- " }];
        expect(applyTransforms("AB-123 456", rules)).toBe("AB123456");
      });

      it("handles empty input", () => {
        const rules: TransformRule[] = [{ type: "strip" }];
        expect(applyTransforms("", rules)).toBe("");
      });
    });

    describe("phone_format transform", () => {
      it("formats as local (last 10 digits)", () => {
        const rules: TransformRule[] = [{ type: "phone_format", format: "local" }];
        expect(applyTransforms("0123456789", rules)).toBe("0123456789");
      });

      it("strips to 10 digits for local format from longer number", () => {
        const rules: TransformRule[] = [{ type: "phone_format", format: "local" }];
        expect(applyTransforms("+84 123 456 789", rules)).toBe("4123456789");
      });

      it("formats as international with default country code", () => {
        const rules: TransformRule[] = [{ type: "phone_format", format: "international" }];
        expect(applyTransforms("0123456789", rules)).toBe("+84123456789");
      });
    });

    describe("country_format NAME", () => {
      it("converts ISO3 to country name", () => {
        const rules: TransformRule[] = [{ type: "country_format", format: "NAME" }];
        expect(applyTransforms("VNM", rules)).toBe("Vietnam");
        expect(applyTransforms("USA", rules)).toBe("United States");
        expect(applyTransforms("JPN", rules)).toBe("Japan");
      });

      it("converts ISO2 to country name via ISO3", () => {
        const rules: TransformRule[] = [{ type: "country_format", format: "NAME" }];
        expect(applyTransforms("VN", rules)).toBe("Vietnam");
        expect(applyTransforms("JP", rules)).toBe("Japan");
      });

      it("returns unknown codes unchanged", () => {
        const rules: TransformRule[] = [{ type: "country_format", format: "NAME" }];
        expect(applyTransforms("XXX", rules)).toBe("XXX");
      });
    });

    describe("country_format ISO3 expanded", () => {
      it("converts additional country codes", () => {
        const rules: TransformRule[] = [{ type: "country_format", format: "ISO3" }];
        expect(applyTransforms("BR", rules)).toBe("BRA");
        expect(applyTransforms("IN", rules)).toBe("IND");
        expect(applyTransforms("RU", rules)).toBe("RUS");
        expect(applyTransforms("TH", rules)).toBe("THA");
        expect(applyTransforms("SG", rules)).toBe("SGP");
      });
    });
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
