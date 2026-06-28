import { describe, it, expect } from "vitest";
import { ok, err, isOk, isErr, unwrapOr } from "../../lib/result";

describe("result", () => {
  describe("ok", () => {
    it("creates an Ok result", () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it("creates an Ok result with string value", () => {
      const result = ok("hello");
      expect(result).toEqual({ ok: true, value: "hello" });
    });

    it("creates an Ok result with object value", () => {
      const value = { a: 1, b: 2 };
      const result = ok(value);
      expect(result).toEqual({ ok: true, value });
    });
  });

  describe("err", () => {
    it("creates an Err result", () => {
      const result = err("something went wrong");
      expect(result).toEqual({ ok: false, error: "something went wrong" });
    });
  });

  describe("isOk", () => {
    it("returns true for Ok result", () => {
      expect(isOk(ok("data"))).toBe(true);
    });

    it("returns false for Err result", () => {
      expect(isOk(err("error"))).toBe(false);
    });
  });

  describe("isErr", () => {
    it("returns true for Err result", () => {
      expect(isErr(err("error"))).toBe(true);
    });

    it("returns false for Ok result", () => {
      expect(isErr(ok("data"))).toBe(false);
    });
  });

  describe("unwrapOr", () => {
    it("returns value for Ok result", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("returns fallback for Err result", () => {
      expect(unwrapOr(err("error"), "default")).toBe("default");
    });
  });
});
