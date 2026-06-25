import type { OcrJobResult } from "@guestfill/shared";
import type { OcrRequest } from "./ocrTypes";

export async function runOcr(request: OcrRequest): Promise<OcrJobResult> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<OcrJobResult>("run_ocr", {
    request: {
      files: request.files,
      outputPath: request.outputPath,
      progressPath: request.options?.progressPath || "",
      options: request.options
        ? {
            documentMode: request.options.documentMode || "auto",
            maxImageWidth: request.options.maxImageWidth || 1800,
            perImageTimeoutSeconds: request.options.perImageTimeoutSeconds || 45,
            perCandidateTimeoutSeconds: request.options.perCandidateTimeoutSeconds || 8,
            enablePassportMrz: request.options.enablePassportMrz ?? true,
            enablePassportVisualOcr: request.options.enablePassportVisualOcr ?? true,
            enableIdCardOcr: request.options.enableIdCardOcr ?? true,
            enablePdfInput: request.options.enablePdfInput ?? true,
            enableDiagnosticsSheet: request.options.enableDiagnosticsSheet ?? true,
            deleteTempFiles: request.options.deleteTempFiles ?? true,
          }
        : undefined,
    },
  });
}

export async function selectFiles(): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<string[]>("select_files");
}

export async function selectFolder(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<string | null>("select_folder");
}

export async function selectOutputFile(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<string | null>("select_output_file");
}
