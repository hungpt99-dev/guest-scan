import { getAllSessions, getAllGuestRows } from "./fill/fillStore";

export type DiagnosticReport = {
  appVersion: string;
  osInfo: string;
  dbStatus: string;
  sessionCount: number;
  guestCount: number;
  eventCount: number;
  generatedAt: string;
};

export async function generateDiagnosticReport(): Promise<DiagnosticReport> {
  const sessions = await getAllSessions();
  const guests = await getAllGuestRows();
  return {
    appVersion: "0.1.0",
    osInfo: navigator.userAgent,
    dbStatus: "connected",
    sessionCount: sessions.length,
    guestCount: guests.length,
    eventCount: 0,
    generatedAt: new Date().toISOString(),
  };
}

export function exportDiagnosticReport(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}
