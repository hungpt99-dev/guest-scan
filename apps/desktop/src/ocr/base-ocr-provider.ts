import type { OcrProvider, OcrResult, OcrProviderType } from "@guestfill/shared";

export abstract class BaseOcrProvider implements OcrProvider {
  abstract readonly name: string;
  abstract readonly type: OcrProviderType;

  protected initialized = false;
  protected _isAvailable = false;
  protected canceled = false;

  abstract processImage(imagePath: string, signal?: AbortSignal): Promise<OcrResult>;

  cancel(): void {
    this.canceled = true;
  }

  isAvailable(): boolean {
    return this._isAvailable;
  }

  protected setupAbortSignal(signal?: AbortSignal): (() => void) | undefined {
    if (!signal) return undefined;

    if (signal.aborted) {
      this.canceled = true;
      return undefined;
    }

    const handler = () => {
      this.canceled = true;
    };
    signal.addEventListener("abort", handler, { once: true });
    return () => signal.removeEventListener("abort", handler);
  }

  protected checkCanceled(): void {
    if (this.canceled) {
      throw new DOMException("OCR was canceled", "AbortError");
    }
  }

  protected async ensureAvailable(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this._isAvailable) {
      throw new Error(`${this.name} provider is not available.`);
    }
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return this._isAvailable;
    this.initialized = true;

    try {
      this._isAvailable = await this.checkAvailability();
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  protected abstract checkAvailability(): Promise<boolean>;

  async destroy(): Promise<void> {
    this.initialized = false;
    this._isAvailable = false;
    this.canceled = false;
  }
}
