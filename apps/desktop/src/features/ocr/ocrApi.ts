import type { OcrJobResult } from "@guestfill/shared";
import type { OcrRequest, OcrJob } from "./ocrTypes";

export async function runOcr(request: OcrRequest): Promise<OcrJobResult> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<OcrJobResult>("run_ocr_placeholder", { request });
}

export async function getOcrJob(jobId: string): Promise<OcrJob | null> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  return invoke<OcrJob | null>("get_ocr_job", { jobId });
}
