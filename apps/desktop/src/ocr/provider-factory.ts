import type { OcrProviderType } from "@guestfill/shared";
import { OcrProviderRegistry, type ProviderFactory } from "./provider-registry";
import { LocalOCRProvider } from "./local-ocr-provider";
import { AzureOCRProvider } from "./azure-ocr-provider";
import { logger } from "../lib/logger";

let defaultRegistry: OcrProviderRegistry | null = null;

function createDefaultRegistry(): OcrProviderRegistry {
  const registry = new OcrProviderRegistry();

  registry.register("LOCAL", () => new LocalOCRProvider(), 10);
  registry.register("AZURE", () => new AzureOCRProvider(), 20);

  return registry;
}

export function getOcrProviderRegistry(): OcrProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}

export function resetOcrProviderRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.clearInstances();
  }
  defaultRegistry = null;
}

export function getProviderInstance(type: OcrProviderType) {
  const registry = getOcrProviderRegistry();
  return registry.getProvider(type);
}

export async function selectBestOcrProvider(preferred?: OcrProviderType) {
  const registry = getOcrProviderRegistry();
  return registry.selectBestProvider(preferred);
}

export function registerOcrProvider(type: OcrProviderType, factory: ProviderFactory, priority?: number): void {
  const registry = getOcrProviderRegistry();
  registry.register(type, factory, priority);
  logger.info("OcrProviderFactory: registered provider", { type, priority });
}
