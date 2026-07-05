import type { GuestRow, FillEvent } from "@guestfill/shared";
import { maskPassportNumber, maskIdNumber, maskFullName } from "@guestfill/shared";
import type { FillSession } from "./fillTypes";
import { getAll, getById, getByIndex, put } from "../../lib/db";

let currentSession: FillSession | null = null;
let currentGuest: GuestRow | null = null;

export function getSession(): FillSession | null {
  return currentSession;
}

export function setSession(session: FillSession): void {
  currentSession = session;
}

export function clearSession(): void {
  currentSession = null;
  currentGuest = null;
}

export function getCurrentGuest(): GuestRow | null {
  return currentGuest;
}

export function setCurrentGuest(guest: GuestRow | null): void {
  currentGuest = guest;
}

export async function saveGuestRow(row: GuestRow): Promise<void> {
  if (!row.id) {
    throw new Error("GuestRow must have an id to be saved");
  }
  await put("guest_rows", row);
}

export async function getGuestRows(sessionId: string): Promise<GuestRow[]> {
  if (!sessionId) {
    return [];
  }
  return getByIndex<GuestRow>("guest_rows", "session_id", sessionId);
}

export async function getAllGuestRows(): Promise<GuestRow[]> {
  return getAll<GuestRow>("guest_rows");
}

export async function getGuestRow(id: string): Promise<GuestRow | undefined> {
  if (!id) return undefined;
  return getById<GuestRow>("guest_rows", id);
}

export async function saveSession(session: FillSession): Promise<void> {
  if (!session.id) {
    throw new Error("FillSession must have an id to be saved");
  }
  await put("import_sessions", session);
}

export async function getAllSessions(): Promise<FillSession[]> {
  return getAll<FillSession>("import_sessions");
}

export async function saveFillEvent(event: FillEvent): Promise<void> {
  if (!event.id) {
    throw new Error("FillEvent must have an id to be saved");
  }
  await put("fill_events", event);
}

export async function getFillEvents(sessionId: string): Promise<FillEvent[]> {
  if (!sessionId) {
    return [];
  }
  return getByIndex<FillEvent>("fill_events", "session_id", sessionId);
}

export async function exportFillLogCsv(sessionId: string): Promise<string> {
  const [events, guestRows] = await Promise.all([getFillEvents(sessionId), getGuestRows(sessionId)]);
  const guestMap = new Map(guestRows.map((g) => [g.id, g]));
  const header = "timestamp,guest_name,document_number_masked,target_system,event,field_name,status,message";
  const rows = events.map((e) => {
    const guest = e.guestRowId ? guestMap.get(e.guestRowId) : undefined;
    const guestName = guest ? maskFullName(guest.fullName) : "";
    const docNum = guest
      ? guest.passportNumber
        ? maskPassportNumber(guest.passportNumber)
        : guest.idNumber
          ? maskIdNumber(guest.idNumber)
          : ""
      : "";
    return `${e.createdAt},${guestName},${docNum},${e.targetSystemId || ""},${e.eventType},${e.fieldName || ""},${e.status},${e.message || ""}`;
  });
  return [header, ...rows].join("\n");
}
