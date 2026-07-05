import { isTauri } from "../../lib/isTauri";
import { logger } from "../../lib/logger";
import type { IpcClient, IpcError } from "./types";

class TauriIpcClient implements IpcClient {
  isAvailable(): boolean {
    return isTauri();
  }

  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    return invoke<T>(command, args);
  }
}

class BrowserIpcClient implements IpcClient {
  isAvailable(): boolean {
    return false;
  }

  async invoke<T>(_command: string, _args?: Record<string, unknown>): Promise<T> {
    throw new Error("IPC is not available in browser mode");
  }
}

let instance: IpcClient | null = null;

export function getIpcClient(): IpcClient {
  if (!instance) {
    instance = isTauri() ? new TauriIpcClient() : new BrowserIpcClient();
  }
  return instance;
}

export function mapIpcError(error: unknown): IpcError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return error as IpcError;
  }
  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Unknown IPC error",
    details: error instanceof Error ? { stack: error.stack } : undefined,
  };
}

export function maskIpcArgs(args: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/imagePath|filePath|path/i.test(key) && typeof value === "string") {
      masked[key] = value.replace(/\/[^/]+\.\w+$/, "/***");
    } else if (/password|secret|token|key/i.test(key)) {
      masked[key] = "[REDACTED]";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export async function invokeIpc<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const client = getIpcClient();

  if (!client.isAvailable()) {
    logger.warn(`IPC: command "${command}" called but IPC is not available`);
    throw {
      code: "IPC_UNAVAILABLE",
      message: "IPC is not available in this environment",
    } satisfies IpcError;
  }

  logger.debug(`IPC: invoking "${command}"`, args ? maskIpcArgs(args) : undefined);

  try {
    const result = await client.invoke<T>(command, args);
    logger.debug(`IPC: command "${command}" succeeded`);
    return result;
  } catch (error) {
    const ipcError = mapIpcError(error);
    logger.warn(`IPC: command "${command}" failed`, { code: ipcError.code, message: ipcError.message });
    throw ipcError;
  }
}
