import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateDiagnosticReport, exportDiagnosticReport } from "../../../features/diagnostics";
import type { DiagnosticReport } from "../../../features/diagnostics";

vi.mock("../../../features/fill/fillStore", () => ({
  getAllSessions: vi.fn(async () => [
    {
      id: "s1",
      excelPath: "/data/1.xlsx",
      totalRows: 10,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "s2",
      excelPath: "/data/2.xlsx",
      totalRows: 5,
      createdAt: "2025-01-02T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    },
  ]),
  getAllGuestRows: vi.fn(async () => [
    { id: "g1", sessionId: "s1", fullName: "Alice" },
    { id: "g2", sessionId: "s1", fullName: "Bob" },
    { id: "g3", sessionId: "s2", fullName: "Charlie" },
  ]),
}));

describe("Diagnostics E2E: report generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates diagnostic report with correct counts", async () => {
    const report = await generateDiagnosticReport();
    expect(report.appVersion).toBe("0.1.0");
    expect(report.dbStatus).toBe("connected");
    expect(report.sessionCount).toBe(2);
    expect(report.guestCount).toBe(3);
    expect(report.generatedAt).toBeTruthy();
    expect(report.osInfo).toBeTruthy();
  });

  it("exports report as formatted JSON", async () => {
    const report = await generateDiagnosticReport();
    const json = exportDiagnosticReport(report);
    const parsed = JSON.parse(json);
    expect(parsed.sessionCount).toBe(2);
    expect(parsed.guestCount).toBe(3);
    expect(parsed.appVersion).toBe("0.1.0");
  });

  it("handles empty database gracefully", async () => {
    const getAllSessions = (await import("../../../features/fill/fillStore")).getAllSessions;
    const getAllGuestRows = (await import("../../../features/fill/fillStore")).getAllGuestRows;
    vi.mocked(getAllSessions).mockResolvedValueOnce([]);
    vi.mocked(getAllGuestRows).mockResolvedValueOnce([]);
    const report = await generateDiagnosticReport();
    expect(report.sessionCount).toBe(0);
    expect(report.guestCount).toBe(0);
  });

  it("includes app version in export", async () => {
    const report: DiagnosticReport = {
      appVersion: "1.2.3",
      osInfo: "Mozilla/5.0",
      dbStatus: "connected",
      sessionCount: 1,
      guestCount: 5,
      eventCount: 10,
      generatedAt: "2025-06-01T00:00:00Z",
    };
    const json = exportDiagnosticReport(report);
    expect(json).toContain("1.2.3");
    expect(json).toContain('"sessionCount": 1');
  });
});
