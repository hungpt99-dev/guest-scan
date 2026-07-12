import { invokeIpc } from "../infra/ipc";
import type { CredentialStatus, SaveCredentialRequest } from "@guestfill/shared";

export interface CredentialService {
  saveCredential(provider: string, keyType: string, value: string): Promise<void>;
  getCredential(provider: string, keyType: string): Promise<string>;
  deleteCredential(provider: string, keyType: string): Promise<void>;
  checkStatus(provider: string): Promise<CredentialStatus>;
}

export class TauriCredentialService implements CredentialService {
  async saveCredential(provider: string, keyType: string, value: string): Promise<void> {
    const request: SaveCredentialRequest = { provider, key_type: keyType as "api_key" | "endpoint", value };
    await invokeIpc<void>("save_credential", { request });
  }

  async getCredential(provider: string, keyType: string): Promise<string> {
    return invokeIpc<string>("get_credential", { request: { provider, key_type: keyType } });
  }

  async deleteCredential(provider: string, keyType: string): Promise<void> {
    await invokeIpc<void>("delete_credential", { request: { provider, key_type: keyType } });
  }

  async checkStatus(provider: string): Promise<CredentialStatus> {
    return invokeIpc<CredentialStatus>("check_credential_status", { provider });
  }
}

class NoopCredentialService implements CredentialService {
  async saveCredential(): Promise<void> {}
  async getCredential(): Promise<string> {
    throw new Error("Credential service unavailable outside Tauri");
  }
  async deleteCredential(): Promise<void> {}
  async checkStatus(): Promise<CredentialStatus> {
    return { provider: "", has_key: false, has_endpoint: false, endpoint_preview: "", key_preview: "" };
  }
}

let instance: CredentialService | null = null;

export function getCredentialService(): CredentialService {
  if (!instance) {
    const isTauri =
      typeof window !== "undefined" &&
      typeof (window as unknown as Record<string, unknown>).__TAURI_IPC__ !== "undefined";
    instance = isTauri ? new TauriCredentialService() : new NoopCredentialService();
  }
  return instance;
}
