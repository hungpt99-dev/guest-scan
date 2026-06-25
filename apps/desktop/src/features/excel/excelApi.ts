import type { ExcelImportResult } from "@guestfill/shared";
import type { ExcelExportRequest, ExcelImportRequest } from "./excelTypes";

export async function exportExcel(request: ExcelExportRequest): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke("export_excel_placeholder", { request });
}

export async function importExcel(request: ExcelImportRequest): Promise<ExcelImportResult> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<ExcelImportResult>("import_excel_placeholder", { request });
}
