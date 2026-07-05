import { describe, it, expect, beforeEach } from "vitest";
import { createAuditLoggerService, type AuditLoggerService } from "../../services/audit_logger";

describe("AuditLoggerService", () => {
  let service: AuditLoggerService;

  beforeEach(() => {
    service = createAuditLoggerService({ debugMode: true });
  });

  describe("startSession", () => {
    it("creates a session with unique ID", () => {
      const session = service.startSession("/tmp/test.jpg");
      expect(session.sessionId).toMatch(/^ocr_/);
      expect(session.imagePath).toBe("/tmp/test.jpg");
      expect(session.startTime).toBeDefined();
      expect(session.artifacts).toEqual([]);
    });

    it("generates unique session IDs", () => {
      const a = service.startSession("a.jpg");
      const b = service.startSession("b.jpg");
      expect(a.sessionId).not.toBe(b.sessionId);
    });
  });

  describe("finalizeSession", () => {
    it("sets endTime on session", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.finalizeSession(session);
      expect(session.endTime).toBeDefined();
      expect(new Date(session.endTime!).getTime()).toBeGreaterThanOrEqual(new Date(session.startTime).getTime());
    });
  });

  describe("addArtifact", () => {
    it("adds artifact to session when debugMode is enabled", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.addArtifact(session, { type: "mrz_crop", imagePath: "/tmp/crop.jpg", filePath: "/tmp/crop.jpg" });
      expect(session.artifacts).toHaveLength(1);
      expect(session.artifacts[0]!.type).toBe("mrz_crop");
    });

    it("does not add artifact when debugMode is disabled", () => {
      const quietService = createAuditLoggerService({ debugMode: false });
      const session = quietService.startSession("/tmp/test.jpg");
      quietService.addArtifact(session, { type: "mrz_crop", imagePath: "/tmp/crop.jpg", filePath: "/tmp/crop.jpg" });
      expect(session.artifacts).toHaveLength(0);
    });

    it("respects max log entries", () => {
      const limitedService = createAuditLoggerService({ debugMode: true, maxLogEntries: 2 });
      const session = limitedService.startSession("/tmp/test.jpg");
      limitedService.addArtifact(session, { type: "ocr_raw_text", source: "mrz", text: "first", confidence: 0.9 });
      limitedService.addArtifact(session, { type: "ocr_raw_text", source: "mrz", text: "second", confidence: 0.9 });
      limitedService.addArtifact(session, { type: "ocr_raw_text", source: "mrz", text: "third", confidence: 0.9 });
      expect(session.artifacts).toHaveLength(2);
    });

    it("masks sensitive data in final_selected_values", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.addArtifact(session, {
        type: "final_selected_values",
        values: { passportNumber: "AB123456", fullName: "John Doe", roomNumber: "101" },
      });
      const artifact = session.artifacts.find((a) => a.type === "final_selected_values");
      if (artifact && "values" in artifact) {
        expect(artifact.values.passportNumber).not.toBe("AB123456");
        expect(artifact.values.fullName).not.toBe("John Doe");
        expect(artifact.values.roomNumber).toBe("101");
      }
    });

    it("masks sensitive data in ocr_raw_text", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.addArtifact(session, {
        type: "ocr_raw_text",
        source: "mrz",
        text: "AB123456 some text",
        confidence: 0.9,
      });
      const artifact = session.artifacts.find((a) => a.type === "ocr_raw_text");
      if (artifact && "text" in artifact) {
        expect(artifact.text).not.toContain("AB123456");
      }
    });
  });

  describe("getSessions / getSession", () => {
    it("returns all sessions", () => {
      service.startSession("a.jpg");
      service.startSession("b.jpg");
      expect(service.getSessions()).toHaveLength(2);
    });

    it("returns a session by ID", () => {
      const session = service.startSession("a.jpg");
      const found = service.getSession(session.sessionId);
      expect(found).toBeDefined();
      expect(found!.imagePath).toBe("a.jpg");
    });

    it("returns undefined for unknown session", () => {
      expect(service.getSession("unknown")).toBeUndefined();
    });
  });

  describe("clearOldSessions", () => {
    it("removes sessions older than max age", () => {
      const session = service.startSession("old.jpg");
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      Object.defineProperty(session, "startTime", { value: pastDate.toISOString() });

      service.clearOldSessions(5);
      expect(service.getSession(session.sessionId)).toBeUndefined();
    });

    it("keeps sessions within max age", () => {
      const session = service.startSession("recent.jpg");
      service.clearOldSessions(5);
      expect(service.getSession(session.sessionId)).toBeDefined();
    });
  });

  describe("clearSession / clearAll", () => {
    it("clears a single session", () => {
      const session = service.startSession("a.jpg");
      service.clearSession(session.sessionId);
      expect(service.getSession(session.sessionId)).toBeUndefined();
    });

    it("clears all sessions", () => {
      service.startSession("a.jpg");
      service.startSession("b.jpg");
      service.clearAll();
      expect(service.getSessions()).toHaveLength(0);
    });
  });

  describe("debugMode", () => {
    it("reports debug mode state", () => {
      const debugService = createAuditLoggerService({ debugMode: true });
      expect(debugService.isDebugMode()).toBe(true);

      const quietService = createAuditLoggerService({ debugMode: false });
      expect(quietService.isDebugMode()).toBe(false);
    });

    it("toggles debug mode", () => {
      service.setDebugMode(false);
      expect(service.isDebugMode()).toBe(false);
      service.setDebugMode(true);
      expect(service.isDebugMode()).toBe(true);
    });
  });

  describe("logDebugArtifacts", () => {
    it("returns session artifacts", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.addArtifact(session, { type: "mrz_crop", imagePath: "/tmp/crop.jpg", filePath: "/tmp/crop.jpg" });
      const logged = service.logDebugArtifacts(session.sessionId);
      expect(logged).toBeDefined();
      expect(logged!.artifacts).toHaveLength(1);
    });

    it("returns undefined for unknown session", () => {
      expect(service.logDebugArtifacts("unknown")).toBeUndefined();
    });
  });

  describe("getArtifactByType", () => {
    it("filters artifacts by type", () => {
      const session = service.startSession("/tmp/test.jpg");
      service.addArtifact(session, { type: "mrz_crop", imagePath: "/tmp/crop.jpg", filePath: "/tmp/crop.jpg" });
      service.addArtifact(session, { type: "ocr_raw_text", source: "mrz", text: "raw", confidence: 0.9 });
      service.addArtifact(session, { type: "warning_list", warnings: ["blurry"] });

      const crops = service.getArtifactByType(session.sessionId, "mrz_crop");
      expect(crops).toHaveLength(1);
      expect(service.getArtifactByType(session.sessionId, "confidence_details")).toHaveLength(0);
    });

    it("returns empty array for unknown session", () => {
      expect(service.getArtifactByType("unknown", "mrz_crop")).toEqual([]);
    });
  });

  describe("config", () => {
    it("returns a copy of the config", () => {
      const config = service.config;
      expect(config.debugMode).toBe(true);
      config.debugMode = false;
      expect(service.config.debugMode).toBe(true);
    });

    it("uses defaults for unspecified config values", () => {
      const defaultService = createAuditLoggerService();
      expect(defaultService.config.debugMode).toBe(false);
      expect(defaultService.config.retentionDays).toBe(7);
      expect(defaultService.config.maxLogEntries).toBe(100);
    });
  });
});
