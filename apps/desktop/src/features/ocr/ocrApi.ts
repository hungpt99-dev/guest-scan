import type { OcrJobResult } from "@guestfill/shared";
import type { OcrRequest } from "./ocrTypes";
import { isTauri, requireTauri } from "../../lib/isTauri";
import {
  DEFAULT_MAX_IMAGE_WIDTH,
  DEFAULT_PER_IMAGE_TIMEOUT_SECONDS,
  DEFAULT_PER_CANDIDATE_TIMEOUT_SECONDS,
  ACCEPTED_OCR_FILE_TYPES,
  DEFAULT_EXPORT_FILENAME,
  SPREADSHEET_MIME_TYPE,
} from "../../config/constants";

interface FileDialogProvider {
  selectFiles(): Promise<string[]>;
  selectFolder(): Promise<string | null>;
  selectOutputFile(filename?: string): Promise<string | null>;
}

class BrowserFileDialogProvider implements FileDialogProvider {
  selectFiles(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ACCEPTED_OCR_FILE_TYPES;
      input.onchange = () => {
        const files = Array.from(input.files || []).map((f) => ("path" in f ? (f as any).path : f.name));
        resolve(files);
      };
      input.onerror = () => reject(new Error("File selection was cancelled or failed."));
      input.click();
    });
  }

  selectFolder(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
      input.onchange = () => {
        const files = Array.from(input.files || []);
        resolve(files.length > 0 && files[0] ? files[0].webkitRelativePath.split("/")[0] || "selected_folder" : null);
      };
      input.onerror = () => reject(new Error("Folder selection was cancelled or failed."));
      input.click();
    });
  }

  selectOutputFile(filename: string = DEFAULT_EXPORT_FILENAME): Promise<string | null> {
    return new Promise((resolve) => {
      const blob = new Blob([], { type: SPREADSHEET_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve(filename);
    });
  }
}

class TauriFileDialogProvider implements FileDialogProvider {
  async selectFiles(): Promise<string[]> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    return invoke<string[]>("select_files");
  }

  async selectFolder(): Promise<string | null> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    return invoke<string | null>("select_folder");
  }

  async selectOutputFile(_filename?: string): Promise<string | null> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    return invoke<string | null>("select_output_file");
  }
}

class FallbackFileDialogProvider implements FileDialogProvider {
  constructor(
    private primary: FileDialogProvider,
    private fallback: FileDialogProvider,
  ) {}

  async selectFiles(): Promise<string[]> {
    try {
      return await this.primary.selectFiles();
    } catch (e) {
      console.warn("Tauri select_files failed, falling back to browser dialog:", e);
      return this.fallback.selectFiles();
    }
  }

  async selectFolder(): Promise<string | null> {
    try {
      return await this.primary.selectFolder();
    } catch (e) {
      console.warn("Tauri select_folder failed, falling back to browser dialog:", e);
      return this.fallback.selectFolder();
    }
  }

  async selectOutputFile(filename?: string): Promise<string | null> {
    try {
      return await this.primary.selectOutputFile(filename);
    } catch (e) {
      console.warn("Tauri select_output_file failed, falling back to browser dialog:", e);
      return this.fallback.selectOutputFile(filename);
    }
  }
}

function createFileDialogProvider(): FileDialogProvider {
  if (!isTauri()) {
    return new BrowserFileDialogProvider();
  }
  return new FallbackFileDialogProvider(new TauriFileDialogProvider(), new BrowserFileDialogProvider());
}

const fileDialog = createFileDialogProvider();

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
            maxImageWidth: request.options.maxImageWidth || DEFAULT_MAX_IMAGE_WIDTH,
            perImageTimeoutSeconds: request.options.perImageTimeoutSeconds || DEFAULT_PER_IMAGE_TIMEOUT_SECONDS,
            perCandidateTimeoutSeconds:
              request.options.perCandidateTimeoutSeconds || DEFAULT_PER_CANDIDATE_TIMEOUT_SECONDS,
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
  return fileDialog.selectFiles();
}

export async function selectFolder(): Promise<string | null> {
  return fileDialog.selectFolder();
}

export async function selectOutputFile(filename?: string): Promise<string | null> {
  return fileDialog.selectOutputFile(filename);
}
