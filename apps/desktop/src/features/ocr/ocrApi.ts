import type { OcrJobResult } from "@guestfill/shared";
import type { OcrRequest } from "./ocrTypes";
import { isTauri, requireTauri } from "../../lib/isTauri";

export async function runOcr(request: OcrRequest): Promise<OcrJobResult> {
  await requireTauri();

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
  if (!isTauri()) {
    return browserSelectFiles();
  }

  const { invoke } = await import("@tauri-apps/api/tauri");
  try {
    const files = await invoke<string[]>("select_files");
    return files;
  } catch (e) {
    console.warn("Tauri select_files failed, falling back to browser dialog:", e);
    return browserSelectFiles();
  }
}

export async function selectFolder(): Promise<string | null> {
  if (!isTauri()) {
    return browserSelectFolder();
  }

  const { invoke } = await import("@tauri-apps/api/tauri");
  try {
    return await invoke<string | null>("select_folder");
  } catch (e) {
    console.warn("Tauri select_folder failed, falling back to browser dialog:", e);
    return browserSelectFolder();
  }
}

export async function selectOutputFile(): Promise<string | null> {
  if (!isTauri()) {
    return browserSaveFile();
  }

  const { invoke } = await import("@tauri-apps/api/tauri");
  try {
    return await invoke<string | null>("select_output_file");
  } catch (e) {
    console.warn("Tauri select_output_file failed, falling back to browser dialog:", e);
    return browserSaveFile();
  }
}

function browserSelectFiles(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.pdf";
    input.onchange = () => {
      const files = Array.from(input.files || []).map((f) => f.name);
      resolve(files.length > 0 ? files : []);
    };
    input.onerror = () => reject(new Error("File selection was cancelled or failed."));
    input.click();
  });
}

function browserSelectFolder(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > 0 && files[0]) {
        resolve(files[0].webkitRelativePath.split("/")[0] || "selected_folder");
      } else {
        resolve(null);
      }
    };
    input.onerror = () => reject(new Error("Folder selection was cancelled or failed."));
    input.click();
  });
}

function browserSaveFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const a = document.createElement("a");
    a.download = "guestfill_export.xlsx";
    a.click();
    resolve("guestfill_export.xlsx");
  });
}
