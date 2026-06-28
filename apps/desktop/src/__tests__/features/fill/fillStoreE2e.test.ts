import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GuestRow, FillEvent } from "@guestfill/shared";
import type { FillSession } from "../../../features/fill/fillTypes";
import {
  saveGuestRow,
  getGuestRows,
  getAllGuestRows,
  getGuestRow,
  saveSession,
  getAllSessions,
  saveFillEvent,
  getFillEvents,
  exportFillLogCsv,
  setSession,
  getSession,
  clearSession,
  setCurrentGuest,
  getCurrentGuest,
} from "../../../features/fill/fillStore";

vi.mock("../../../lib/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../../lib/db");
  const _store = new Map<string, unknown[]>();
  return {
    ...actual,
    put: vi.fn(async (storeName: string, value: unknown) => {
      const arr = _store.get(storeName) ?? [];
      const val = value as Record<string, unknown>;
      const existingIdx = arr.findIndex((v) => {
        const item = v as Record<string, unknown>;
        if (item.id !== undefined && item.id === val.id) return true;
        if (item.key !== undefined && val.key !== undefined && item.key === val.key) return true;
        return item.id === val.id;
      });
      if (existingIdx >= 0) {
        arr[existingIdx] = value;
      } else {
        arr.push(value);
      }
      _store.set(storeName, arr);
    }),
    getAll: vi.fn(async (storeName: string) => _store.get(storeName) ?? []),
    getById: vi.fn(async (_storeName: string, id: string) => {
      const arr = _store.get(_storeName) ?? [];
      return (arr as Array<Record<string, unknown>>).find((v) => v.id === id || v.key === id);
    }),
    getByIndex: vi.fn(async (storeName: string, _idx: string, value: string) => {
      const arr = _store.get(storeName) ?? [];
      return (arr as Array<Record<string, unknown>>).filter((v) => v.sessionId === value);
    }),
    __clear: vi.fn(() => _store.clear()),
  };
});

function createGuest(overrides?: Partial<GuestRow>): GuestRow {
  return {
    id: `guest-${crypto.randomUUID().slice(0, 8)}`,
    sessionId: "session-1",
    rowId: `row-${crypto.randomUUID().slice(0, 8)}`,
    fullName: "Test Guest",
    gender: "M",
    documentType: "PASSPORT",
    status: "READY",
    fillStatus: "PENDING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSession(overrides?: Partial<FillSession>): FillSession {
  return {
    id: `session-${crypto.randomUUID().slice(0, 8)}`,
    excelPath: "/path/to/file.xlsx",
    excelFileHash: "abc123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalRows: 0,
    readyCount: 0,
    needReviewCount: 0,
    missingDataCount: 0,
    failedCount: 0,
    ...overrides,
  };
}

describe("Fill Store E2E: full integration", () => {
  beforeEach(async () => {
    const db = await import("../../../lib/db");
    (db as unknown as { __clear: () => void }).__clear();
    clearSession();
    vi.clearAllMocks();
  });

  describe("session management", () => {
    it("sets and gets current session in memory", () => {
      const session = createSession({ excelPath: "/data/import.xlsx", totalRows: 10 });
      setSession(session);
      expect(getSession()).toBe(session);
    });

    it("clears session and current guest", () => {
      const session = createSession();
      setSession(session);
      setCurrentGuest(createGuest());
      clearSession();
      expect(getSession()).toBeNull();
      expect(getCurrentGuest()).toBeNull();
    });

    it("saves and retrieves sessions from persistence", async () => {
      const s1 = createSession();
      const s2 = createSession();
      await saveSession(s1);
      await saveSession(s2);
      const all = await getAllSessions();
      expect(all).toHaveLength(2);
    });
  });

  describe("guest row management", () => {
    it("saves and retrieves guest rows", async () => {
      const g1 = createGuest({ fullName: "Alice", sessionId: "s1" });
      const g2 = createGuest({ fullName: "Bob", sessionId: "s1" });
      const g3 = createGuest({ fullName: "Charlie", sessionId: "s2" });
      await saveGuestRow(g1);
      await saveGuestRow(g2);
      await saveGuestRow(g3);
      expect(await getAllGuestRows()).toHaveLength(3);
      expect(await getGuestRows("s1")).toHaveLength(2);
      expect(await getGuestRows("s2")).toHaveLength(1);
    });

    it("retrieves single guest by id", async () => {
      const g = createGuest({ fullName: "Specific" });
      await saveGuestRow(g);
      expect(await getGuestRow(g.id)).toBeDefined();
      expect(await getGuestRow("nonexistent")).toBeUndefined();
    });

    it("updates existing guest row", async () => {
      const g = createGuest({ fullName: "Original" });
      await saveGuestRow(g);
      g.fullName = "Updated";
      await saveGuestRow(g);
      expect(await getGuestRow(g.id)).toBeDefined();
      expect((await getGuestRow(g.id))!.fullName).toBe("Updated");
    });

    it("handles guests with various statuses", async () => {
      await saveGuestRow(createGuest({ status: "READY", fillStatus: "PENDING" }));
      await saveGuestRow(createGuest({ status: "NEED_REVIEW", fillStatus: "PENDING" }));
      await saveGuestRow(createGuest({ status: "FAILED", fillStatus: "FAILED" }));
      await saveGuestRow(createGuest({ status: "MISSING_DATA", fillStatus: "PENDING" }));
      await saveGuestRow(createGuest({ status: "READY", fillStatus: "FILLED" }));
      await saveGuestRow(createGuest({ status: "READY", fillStatus: "SKIPPED" }));
      expect(await getGuestRow("nonexistent")).toBeUndefined();
      expect(await getAllGuestRows()).toHaveLength(6);
    });
  });

  describe("fill events", () => {
    it("saves and retrieves events by session", async () => {
      const e1: FillEvent = {
        id: "e1",
        sessionId: "s1",
        guestRowId: "",
        eventType: "EXCEL_IMPORTED",
        status: "SUCCESS",
        createdAt: new Date().toISOString(),
      };
      const e2: FillEvent = {
        id: "e2",
        sessionId: "s1",
        guestRowId: "g1",
        eventType: "GUEST_OPENED",
        status: "SUCCESS",
        createdAt: new Date().toISOString(),
      };
      const e3: FillEvent = {
        id: "e3",
        sessionId: "s2",
        guestRowId: "g2",
        eventType: "FIELD_COPIED",
        fieldName: "fullName",
        status: "SUCCESS",
        createdAt: new Date().toISOString(),
      };
      await saveFillEvent(e1);
      await saveFillEvent(e2);
      await saveFillEvent(e3);
      expect(await getFillEvents("s1")).toHaveLength(2);
      expect(await getFillEvents("s2")).toHaveLength(1);
    });

    it("records all fill event types", async () => {
      const types = [
        "EXCEL_IMPORTED",
        "GUEST_OPENED",
        "FIELD_COPIED",
        "GUEST_MARKED_FILLED",
        "GUEST_MARKED_SKIPPED",
        "FILL_FAILED",
      ] as const;
      const sessionId = "s-events";
      for (const eventType of types) {
        await saveFillEvent({
          id: crypto.randomUUID(),
          sessionId,
          guestRowId: "g1",
          eventType,
          status: "SUCCESS",
          createdAt: new Date().toISOString(),
        });
      }
      const events = await getFillEvents(sessionId);
      expect(events).toHaveLength(6);
    });
  });

  describe("CSV export", () => {
    it("exports fill log as CSV with masked data", async () => {
      const sessionId = "csv-session";
      await saveSession(createSession({ id: sessionId }));
      const g = createGuest({
        id: "g-csv-1",
        sessionId,
        fullName: "Jane Smith",
        passportNumber: "AB123456",
      });
      await saveGuestRow(g);
      await saveFillEvent({
        id: "ev-csv-1",
        sessionId,
        guestRowId: g.id,
        eventType: "FIELD_COPIED",
        fieldName: "fullName",
        status: "SUCCESS",
        createdAt: "2025-01-01T00:00:00Z",
      });
      await saveFillEvent({
        id: "ev-csv-2",
        sessionId,
        guestRowId: g.id,
        eventType: "GUEST_MARKED_FILLED",
        status: "SUCCESS",
        createdAt: "2025-01-01T00:01:00Z",
      });
      const csv = await exportFillLogCsv(sessionId);
      expect(csv).toContain("timestamp,guest_name,document_number_masked");
      expect(csv).toContain("FIELD_COPIED");
      expect(csv).toContain("GUEST_MARKED_FILLED");
      expect(csv).not.toContain("Jane Smith");
      expect(csv).not.toContain("AB123456");
    });

    it("returns header-only CSV when no events exist", async () => {
      const csv = await exportFillLogCsv("empty-session");
      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(
        "timestamp,guest_name,document_number_masked,target_system,event,field_name,status,message",
      );
    });
  });

  describe("current guest", () => {
    it("tracks current guest being filled", () => {
      const g = createGuest({ fullName: "Active Guest" });
      expect(getCurrentGuest()).toBeNull();
      setCurrentGuest(g);
      expect(getCurrentGuest()?.fullName).toBe("Active Guest");
      setCurrentGuest(null);
      expect(getCurrentGuest()).toBeNull();
    });
  });
});
