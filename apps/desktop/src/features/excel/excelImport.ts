import type { GuestRow, FillEvent } from "@guestfill/shared";
import type { ImportSummary } from "../fill/fillTypes";
import { saveGuestRow, saveSession, saveFillEvent } from "../fill/fillStore";

const REQUIRED_ALL_COLUMNS = ["fullName", "dateOfBirth", "gender", "documentType"];

export type ImportResult = {
  success: boolean;
  summary: ImportSummary;
  errors: Array<{ code: string; message: string }>;
  sessionId: string;
};

export type RawExcelRow = Record<string, string | number | null | undefined>;

export async function importExcelFromPath(filePath: string): Promise<ImportResult> {
  let dataRows: RawExcelRow[];

  try {
    dataRows = await readExcelFile(filePath);
  } catch (e) {
    return failResult([{ code: "EXCEL_IMPORT_FAILED", message: `Failed to read Excel file: ${e}` }]);
  }

  if (dataRows.length === 0) {
    return failResult([{ code: "NO_VALID_ROWS", message: "No data found in the Excel file." }]);
  }

  const headers = Object.keys(dataRows[0] || {});
  const headerMap = buildHeaderMap(headers);

  const missingRequired = REQUIRED_ALL_COLUMNS.filter((c) => !headerMap[c]);
  if (missingRequired.length > 0) {
    return failResult([
      {
        code: "MISSING_REQUIRED_COLUMN",
        message: `Missing required columns: ${missingRequired.join(", ")}`,
      },
    ]);
  }

  const validRows = dataRows.filter((row) => {
    const name = row[headerMap["fullName"] ?? "fullName"];
    return name !== undefined && name !== null && String(name).trim() !== "";
  });

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const guestRows: GuestRow[] = [];
  const seenDocNumbers = new Set<string>();
  let readyCount = 0;
  let needReviewCount = 0;
  let missingDataCount = 0;
  let failedCount = 0;
  let duplicateCount = 0;
  const skippedEmpty = dataRows.length - validRows.length;

  for (const rawRow of validRows) {
    const guest = normalizeGuestRow(rawRow, headerMap, sessionId, now);
    guestRows.push(guest);

    const docNum = guest.passportNumber || guest.idNumber;
    if (docNum) {
      if (seenDocNumbers.has(docNum)) duplicateCount++;
      seenDocNumbers.add(docNum);
    }

    if (guest.status === "FAILED") failedCount++;
    else if (guest.status === "MISSING_DATA") missingDataCount++;
    else if (guest.status === "NEED_REVIEW") needReviewCount++;
    else if (guest.status === "READY") readyCount++;
  }

  const sessionObj = {
    id: sessionId,
    excelPath: filePath,
    excelFileHash: "",
    createdAt: now,
    updatedAt: now,
    totalRows: guestRows.length,
    readyCount,
    needReviewCount,
    missingDataCount,
    failedCount,
  };

  await saveSession(sessionObj);

  const importEvent: FillEvent = {
    id: crypto.randomUUID(),
    sessionId,
    guestRowId: "",
    eventType: "EXCEL_IMPORTED",
    status: "SUCCESS",
    message: `Imported ${guestRows.length} guests`,
    createdAt: now,
  };
  await saveFillEvent(importEvent);

  for (const guest of guestRows) {
    await saveGuestRow(guest);
  }

  return {
    success: true,
    summary: {
      totalRows: guestRows.length,
      imported: guestRows.length,
      ready: readyCount,
      needReview: needReviewCount,
      missingData: missingDataCount,
      failed: failedCount,
      duplicateDocuments: duplicateCount,
      skippedEmpty,
    },
    errors: [],
    sessionId,
  };
}

async function readExcelFile(filePath: string): Promise<RawExcelRow[]> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  const XLSX = await import("xlsx");

  const fileData = await invoke<number[]>("read_excel_file", { path: filePath });
  const uint8 = new Uint8Array(fileData);
  const workbook = XLSX.read(uint8, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<RawExcelRow>(firstSheet);
}

function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const normalized = normalizeHeaderName(h);
    if (!map[normalized]) {
      map[normalized] = h;
    }
  }
  return map;
}

function normalizeHeaderName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[\s_-]/g, "");
  const columnMap: Record<string, string> = {
    fullname: "fullName",
    surname: "surname",
    givenname: "givenName",
    passportnumber: "passportNumber",
    idnumber: "idNumber",
    nationality: "nationality",
    dateofbirth: "dateOfBirth",
    gender: "gender",
    passportexpirydate: "passportExpiryDate",
    idexpirydate: "idExpiryDate",
    issuingcountry: "issuingCountry",
    issuingauthority: "issuingAuthority",
    documenttype: "documentType",
    roomnumber: "roomNumber",
    arrivaldate: "arrivalDate",
    departuredate: "departureDate",
    reservationcode: "reservationCode",
    status: "status",
    confidencescore: "confidenceScore",
    confidencelevel: "confidenceLevel",
    note: "note",
    ocrwarning: "ocrWarning",
    sourcefile: "sourceFile",
    rowid: "rowId",
  };
  return columnMap[cleaned] || name;
}

function normalizeGuestRow(
  raw: RawExcelRow,
  headerMap: Record<string, string>,
  sessionId: string,
  now: string,
): GuestRow {
  const get = (key: string): string => {
    const h = headerMap[key];
    if (!h) return "";
    const val = raw[h];
    if (val === undefined || val === null) return "";
    return String(val).trim();
  };

  const docType = normalizeDocumentType(get("documentType"));
  const gender = normalizeGender(get("gender"));
  const status = normalizeStatus(get("status"), docType, {
    passportNumber: get("passportNumber"),
    idNumber: get("idNumber"),
  });

  return {
    id: crypto.randomUUID(),
    sessionId,
    rowId: get("rowId") || crypto.randomUUID(),
    fullName: get("fullName"),
    surname: get("surname"),
    givenName: get("givenName"),
    passportNumber: get("passportNumber"),
    idNumber: get("idNumber"),
    nationality: get("nationality"),
    dateOfBirth: get("dateOfBirth"),
    gender,
    passportExpiryDate: get("passportExpiryDate"),
    idExpiryDate: get("idExpiryDate"),
    issuingCountry: get("issuingCountry"),
    issuingAuthority: get("issuingAuthority"),
    documentType: docType,
    roomNumber: get("roomNumber"),
    arrivalDate: get("arrivalDate"),
    departureDate: get("departureDate"),
    reservationCode: get("reservationCode"),
    status,
    confidenceScore: parseFloat(get("confidenceScore")) || undefined,
    confidenceLevel: normalizeConfidence(get("confidenceLevel")),
    fillStatus: "PENDING",
    note: get("note"),
    ocrWarning: get("ocrWarning"),
    sourceFile: get("sourceFile"),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeDocumentType(raw: string): "PASSPORT" | "ID_CARD" | "UNKNOWN" {
  const upper = raw.toUpperCase().replace(/\s/g, "");
  if (upper === "PASSPORT" || upper === "P") return "PASSPORT";
  if (upper === "ID_CARD" || upper === "IDCARD" || upper === "ID") return "ID_CARD";
  return "UNKNOWN";
}

function normalizeGender(raw: string): "M" | "F" | "UNKNOWN" {
  const upper = raw.toUpperCase();
  if (upper === "M" || upper === "MALE" || upper === "NAM") return "M";
  if (upper === "F" || upper === "FEMALE" || upper === "NỮ" || upper === "NU") return "F";
  return "UNKNOWN";
}

function normalizeConfidence(raw: string): "HIGH" | "MEDIUM" | "LOW" | undefined {
  const upper = raw.toUpperCase();
  if (upper === "HIGH") return "HIGH";
  if (upper === "MEDIUM") return "MEDIUM";
  if (upper === "LOW") return "LOW";
  return undefined;
}

function normalizeStatus(
  raw: string,
  docType: string,
  extra: { passportNumber: string; idNumber: string },
): "READY" | "NEED_REVIEW" | "FAILED" | "MISSING_DATA" | "FILLED" | "SKIPPED" {
  const upper = raw.toUpperCase().replace(/[\s_-]/g, "");
  if (upper === "READY") return "READY";
  if (upper === "NEEDREVIEW") return "NEED_REVIEW";
  if (upper === "FAILED") return "FAILED";
  if (upper === "FILLED") return "FILLED";
  if (upper === "SKIPPED") return "SKIPPED";
  if (upper === "MISSINGDATA") return "MISSING_DATA";

  if (!raw) {
    if (!extra.passportNumber && docType === "PASSPORT") return "MISSING_DATA";
    if (!extra.idNumber && docType === "ID_CARD") return "MISSING_DATA";
  }

  return "NEED_REVIEW";
}

function failResult(errors: Array<{ code: string; message: string }>): ImportResult {
  return {
    success: false,
    summary: {
      totalRows: 0,
      imported: 0,
      ready: 0,
      needReview: 0,
      missingData: 0,
      failed: 0,
      duplicateDocuments: 0,
      skippedEmpty: 0,
    },
    errors,
    sessionId: "",
  };
}
