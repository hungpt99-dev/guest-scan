import { describe, it, expect, beforeEach, vi } from "vitest";
import { Logger, logger } from "../../lib/logging";

describe("Logger", () => {
  let log: Logger;

  beforeEach(() => {
    log = new Logger({ level: "DEBUG" });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("log levels", () => {
    it("logs at configured level and above", () => {
      const l = new Logger({ level: "WARN" });
      l.debug("debug msg");
      l.info("info msg");
      l.warn("warn msg");
      l.error("error msg");
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("logs all levels at DEBUG", () => {
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");
      expect(console.debug).toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("does not log when disabled", () => {
      log.configure({ enabled: false });
      log.info("should not appear");
      expect(console.info).not.toHaveBeenCalled();
    });
  });

  describe("sensitive data masking", () => {
    it("masks passport numbers by default", () => {
      log.info("test", { passportNumber: "AB123456" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("AB123456");
      expect(call).toContain("AB12");
      expect(call).toContain("****");
    });

    it("masks ID numbers by default", () => {
      log.info("test", { idNumber: "1234567890" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("1234567890");
      expect(call).toContain("1234");
    });

    it("masks full names by default", () => {
      log.info("test", { fullName: "John Doe" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("D**");
    });

    it("masks first and last names by default", () => {
      log.info("test", { firstName: "John", lastName: "Doe" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("J***");
      expect(call).toContain("D**");
    });

    it("masks surnames and given names", () => {
      log.info("test", { surname: "Johnson", givenName: "Alice" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("J******");
      expect(call).toContain("A****");
    });

    it("redacts image paths", () => {
      log.info("test", { imagePath: "/tmp/passport.jpg" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("[REDACTED]");
    });

    it("masks MRZ raw text", () => {
      log.info("test", { mrzRaw: "P<USASMIT<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("MIT<<JOHN");
      expect(call).toContain("***");
    });

    it("masks dates of birth", () => {
      log.info("test", { dateOfBirth: "1990-01-15" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("1990-01-15");
      expect(call).toContain("1990");
    });

    it("masks expiry dates", () => {
      log.info("test", { expiryDate: "2025-12-31" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("2025-12-31");
      expect(call).toContain("2025");
    });

    it("respects maskDocumentNumber=false config", () => {
      log.configure({ maskDocumentNumber: false });
      log.info("test", { passportNumber: "AB123456" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("AB123456");
    });

    it("respects maskFullName=false config", () => {
      log.configure({ maskFullName: false });
      log.info("test", { fullName: "John Doe" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("John Doe");
    });

    it("respects maskImages=false config", () => {
      log.configure({ maskImages: false });
      log.info("test", { imagePath: "/tmp/passport.jpg" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("/tmp/passport.jpg");
    });
  });

  describe("nested context masking", () => {
    it("masks sensitive values in nested objects", () => {
      log.info("test", {
        fields: {
          passportNumber: "AB123456",
          fullName: "John Doe",
        },
      });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("AB123456");
      expect(call).not.toContain("John Doe");
    });
  });

  describe("structured context", () => {
    it("includes context in log output", () => {
      log.info("processing complete", { durationMs: 150, items: 5 });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("processing complete");
      expect(call).toContain("150");
      expect(call).toContain("5");
    });
  });

  describe("error logging", () => {
    it("logs error objects with message and name", () => {
      log.error("operation failed", new Error("disk full"));
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("operation failed");
      expect(call).toContain("disk full");
      expect(call).toContain("Error");
    });

    it("logs string errors", () => {
      log.error("failed", "something went wrong");
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("failed");
      expect(call).toContain("something went wrong");
    });
  });

  describe("child logger", () => {
    it("forwards parent context to all logs", () => {
      const child = log.child({ service: "MrzParser" });
      child.info("parsing done", { format: "TD3" });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).toContain("MrzParser");
      expect(call).toContain("TD3");
    });

    it("child context does not affect parent", () => {
      const child = log.child({ service: "MrzParser" });
      child.info("child msg");
      log.info("parent msg");
      const childCall = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      const parentCall = (console.info as ReturnType<typeof vi.fn>).mock.calls[1]?.[0];
      expect(childCall).toContain("MrzParser");
      expect(parentCall).not.toContain("MrzParser");
    });
  });

  describe("configure", () => {
    it("updates log level", () => {
      log.configure({ level: "ERROR" });
      log.info("should not appear");
      expect(console.info).not.toHaveBeenCalled();
    });

    it("returns current config", () => {
      const config = log.getConfig();
      expect(config.level).toBe("DEBUG");
      expect(config.enabled).toBe(true);
      expect(config.maskDocumentNumber).toBe(true);
    });
  });

  describe("long string truncation", () => {
    it("truncates strings longer than 2000 chars", () => {
      const long = "x".repeat(2500);
      log.info("test", { data: long });
      const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(call).not.toContain("x".repeat(2001));
      expect(call).toContain("...");
    });
  });

  describe("global singleton", () => {
    it("exists and can log", () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.configure).toBe("function");
    });
  });
});
