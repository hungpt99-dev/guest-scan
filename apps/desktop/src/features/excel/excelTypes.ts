export type ExcelPreview = {
  fileName: string;
  totalRows: number;
  columns: string[];
};

export type ExcelExportRequest = {
  outputPath: string;
  guestRowIds: string[];
};

export type ExcelImportRequest = {
  filePath: string;
};
