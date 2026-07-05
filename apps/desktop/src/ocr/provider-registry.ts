import type { OcrProvider, OcrProviderType, OcrResult } from "@guestfill/shared";

export type ProviderFactory = () => OcrProvider;

export type ProviderRegistration = {
  type: OcrProviderType;
  factory: ProviderFactory;
  priority: number;
};

export class OcrProviderRegistry {
  private providers: Map<OcrProviderType, ProviderRegistration> = new Map();
  private instances: Map<OcrProviderType, OcrProvider> = new Map();

  register(type: OcrProviderType, factory: ProviderFactory, priority: number = 0): void {
    this.providers.set(type, { type, factory, priority });
    this.instances.delete(type);
  }

  unregister(type: OcrProviderType): void {
    this.providers.delete(type);
    this.instances.delete(type);
  }

  getProvider(type: OcrProviderType): OcrProvider {
    const existing = this.instances.get(type);
    if (existing) return existing;

    const registration = this.providers.get(type);
    if (!registration) {
      throw new Error(`No OCR provider registered for type: ${type}`);
    }

    const instance = registration.factory();
    this.instances.set(type, instance);
    return instance;
  }

  getRegisteredTypes(): OcrProviderType[] {
    return Array.from(this.providers.keys());
  }

  async getAvailableProviders(): Promise<OcrProvider[]> {
    const available: OcrProvider[] = [];

    const sorted = Array.from(this.providers.entries()).sort(([, a], [, b]) => b.priority - a.priority);

    for (const [type] of sorted) {
      try {
        const provider = this.getProvider(type);
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          available.push(provider);
        }
      } catch {
        // Provider not available, skip
      }
    }

    return available;
  }

  async selectBestProvider(preferred?: OcrProviderType): Promise<OcrProvider> {
    if (preferred && this.providers.has(preferred)) {
      const provider = this.getProvider(preferred);
      const available = await provider.isAvailable();
      if (available) {
        return provider;
      }
    }

    const available = await this.getAvailableProviders();
    if (available.length === 0) {
      throw new Error("No OCR providers are available");
    }

    return available[0]!;
  }

  clearInstances(): void {
    this.instances.clear();
  }
}

export type OcrWithFallbackResult = {
  result: OcrResult;
  provider: OcrProviderType;
  usedFallback: boolean;
  fallbackChain: OcrProviderType[];
};

export async function runOcrWithFallback(
  imagePath: string,
  registry: OcrProviderRegistry,
  preferred?: OcrProviderType,
  signal?: AbortSignal,
): Promise<OcrWithFallbackResult> {
  const providers = registry.getRegisteredTypes();

  const ordered = preferred ? [preferred, ...providers.filter((t) => t !== preferred)] : providers;

  let lastError: Error | null = null;

  for (const type of ordered) {
    if (signal?.aborted) {
      throw new DOMException("OCR was canceled", "AbortError");
    }

    try {
      const provider = registry.getProvider(type);
      const result = await provider.processImage(imagePath, signal);

      const isFallback = type !== preferred;

      return {
        result,
        provider: type,
        usedFallback: isFallback,
        fallbackChain: isFallback ? [preferred!, type] : [type],
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("All OCR providers failed");
}
