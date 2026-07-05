export type Environment = "development" | "production" | "test";

export interface EnvConfig {
  environment: Environment;
  isTauri: boolean;
  isBrowser: boolean;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
}

function detectEnvironment(): Environment {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return "test";
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

function detectTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>).__TAURI_IPC__ !== "undefined" &&
    (window as unknown as Record<string, unknown>).__TAURI_IPC__ !== null
  );
}

export function getEnvConfig(): EnvConfig {
  const environment = detectEnvironment();
  return {
    environment,
    isTauri: detectTauri(),
    isBrowser: typeof window !== "undefined" && !detectTauri(),
    isDevelopment: environment === "development",
    isProduction: environment === "production",
    isTest: environment === "test",
  };
}

export const envConfig: EnvConfig = getEnvConfig();

export interface AppEnvVars {
  logLevel: string;
  enableOnlineOcr: boolean;
  localBridgePort: number;
  azureEndpoint: string;
  azureApiKey: string;
}

function readEnvVar(key: string): string | undefined {
  const meta =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as Record<string, unknown>).env as Record<string, string | undefined> | undefined)
      : undefined;
  if (meta && meta[key] !== undefined) return meta[key];

  if (typeof process !== "undefined" && process.env) {
    const procEnv = process.env as Record<string, string | undefined>;
    if (procEnv[key] !== undefined) return procEnv[key];
  }

  return undefined;
}

function findFirstDefined(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readEnvVar(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseBoolean(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  return raw === "true" || raw === "1" || raw === "yes";
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const ENV_VAR_DEFINITIONS = [
  {
    key: "logLevel",
    envKeys: ["VITE_GUESTFILL_LOG_LEVEL", "GUESTFILL_LOG_LEVEL"],
    defaultValue: "INFO",
    required: false,
    parse: (raw: string | undefined) => (raw ?? "INFO").toUpperCase(),
    validate: (v: string) => {
      const valid = ["DEBUG", "INFO", "WARN", "ERROR"];
      return valid.includes(v) ? null : `Invalid log level "${v}". Must be one of: ${valid.join(", ")}`;
    },
    description: "Logging level: DEBUG, INFO, WARN, or ERROR",
  },
  {
    key: "enableOnlineOcr",
    envKeys: ["VITE_GUESTFILL_ENABLE_ONLINE_OCR", "GUESTFILL_ENABLE_ONLINE_OCR"],
    defaultValue: false,
    required: false,
    parse: (raw: string | undefined) => parseBoolean(raw),
    description: "Enable online OCR providers (Azure, etc.)",
  },
  {
    key: "localBridgePort",
    envKeys: ["VITE_GUESTFILL_LOCAL_BRIDGE_PORT", "GUESTFILL_LOCAL_BRIDGE_PORT"],
    defaultValue: 43175,
    required: false,
    parse: (raw: string | undefined) => parseNumber(raw, 43175),
    validate: (v: number) => {
      return v > 0 && v < 65536 ? null : `Invalid port "${v}". Must be between 1 and 65535.`;
    },
    description: "Port for the local IPC bridge",
  },
  {
    key: "azureEndpoint",
    envKeys: ["VITE_GUESTFILL_AZURE_ENDPOINT", "GUESTFILL_AZURE_ENDPOINT"],
    defaultValue: "",
    required: false,
    parse: (raw: string | undefined) => raw ?? "",
    description: "Azure Document Intelligence endpoint URL",
  },
  {
    key: "azureApiKey",
    envKeys: ["VITE_GUESTFILL_AZURE_API_KEY", "GUESTFILL_AZURE_API_KEY"],
    defaultValue: "",
    required: false,
    parse: (raw: string | undefined) => raw ?? "",
    description: "Azure Document Intelligence API key",
  },
] as const;

export class ConfigValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

export function loadEnvVars(): AppEnvVars {
  const raw: Record<string, unknown> = {};
  const validationErrors: string[] = [];

  for (const def of ENV_VAR_DEFINITIONS) {
    const rawValue = findFirstDefined(def.envKeys);
    const parsed = def.parse(rawValue);

    if (def.required && (parsed === undefined || parsed === "" || parsed === false)) {
      const keys = def.envKeys.join(" or ");
      validationErrors.push(`Missing required environment variable: ${keys} (${def.description})`);
      continue;
    }

    const validateFn = (def as { validate?: (value: unknown) => string | null }).validate;
    if (validateFn) {
      const error = validateFn(parsed);
      if (error) {
        validationErrors.push(`${def.envKeys[0]}: ${error}`);
      }
    }

    raw[def.key] = parsed;
  }

  if (validationErrors.length > 0 && !envConfig.isDevelopment) {
    throw new ConfigValidationError(validationErrors);
  }

  return raw as unknown as AppEnvVars;
}

let _cachedEnvVars: AppEnvVars | null = null;

export function getEnvVars(): AppEnvVars {
  if (!_cachedEnvVars) {
    _cachedEnvVars = loadEnvVars();
  }
  return _cachedEnvVars;
}

export function reloadEnvVars(): AppEnvVars {
  _cachedEnvVars = null;
  return getEnvVars();
}
