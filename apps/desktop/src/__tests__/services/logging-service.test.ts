import { describe, it, expect, beforeEach } from "vitest";
import { addLog, getLogs, clearLogs } from "../../services/loggingService";

describe("loggingService", () => {
  beforeEach(() => {
    clearLogs();
  });

  describe("addLog", () => {
    it("should add a log entry with timestamp", () => {
      addLog("test message");
      const logs = getLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0]!.message).toBe("test message");
      expect(logs[0]!.timestamp).toBeDefined();
    });
  });

  describe("getLogs", () => {
    it("should return all log entries", () => {
      addLog("first");
      addLog("second");

      const logs = getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]!.message).toBe("first");
      expect(logs[1]!.message).toBe("second");
    });

    it("should return a copy, not the original array", () => {
      addLog("test");
      const logs = getLogs();
      logs.length = 0;
      expect(getLogs()).toHaveLength(1);
    });

    it("should return empty array when no logs", () => {
      expect(getLogs()).toEqual([]);
    });
  });

  describe("clearLogs", () => {
    it("should clear all log entries", () => {
      addLog("test");
      clearLogs();
      expect(getLogs()).toEqual([]);
    });

    it("should handle clearing empty logs", () => {
      clearLogs();
      expect(getLogs()).toEqual([]);
    });
  });
});
