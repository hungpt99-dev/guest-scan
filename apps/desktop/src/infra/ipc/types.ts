export type IpcInvokeResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

export type IpcError = {
  code: string;
  message: string;
  details?: unknown;
};

export interface IpcClient {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  isAvailable(): boolean;
}
