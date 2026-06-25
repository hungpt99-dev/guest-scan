import type { GuestRow, AppError } from "./index";

export type ExcelColumn = {
  key: string;
  label: string;
  required: boolean;
};

export type ExcelExportOptions = {
  outputPath: string;
  columns: string[];
};

export type ExcelImportResult = {
  rows: GuestRow[];
  errors: AppError[];
  totalRows: number;
  validRows: number;
};
