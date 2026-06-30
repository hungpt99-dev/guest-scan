import { maskPassportNumber, maskIdNumber, maskFullName } from "@guestfill/shared";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export interface LoggerConfig {
  level: LogLevel;
  maskDocumentNumber: boolean;
  maskFullName: boolean;
  maskImages: boolean;
  enabled: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: "INFO",
  maskDocumentNumber: true,
  maskFullName: true,
  maskImages: true,
  enabled: true,
};

type SensitivePattern = {
  test: (key: string) => boolean;
  mask: (value: string) => string;
};

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    test: (k) => /^passport(?:Number)?$/i.test(k) || /passport.?number/i.test(k),
    mask: (v) => maskPassportNumber(v),
  },
  {
    test: (k) => /^documentNumber$/i.test(k) || /document.?number/i.test(k),
    mask: (v) => maskPassportNumber(v),
  },
  {
    test: (k) =>
      /^idNumber$/i.test(k) || /id.?number/i.test(k) || /personal.?number/i.test(k) || /national.?id/i.test(k),
    mask: (v) => maskIdNumber(v),
  },
  {
    test: (k) =>
      /^fullName$/i.test(k) ||
      /^firstName$/i.test(k) ||
      /^lastName$/i.test(k) ||
      /^surname$/i.test(k) ||
      /^givenName$/i.test(k),
    mask: (v) => maskFullName(v),
  },
  {
    test: (k) => /mrzRaw|mrzParsed|fullMrz|mrzLines/i.test(k),
    mask: (v) => (v.length > 10 ? v.slice(0, 8) + "***" : "***"),
  },
  {
    test: (k) => /imagePath|imageData|base64Image|capturedImage|rawImage/i.test(k),
    mask: () => "[REDACTED]",
  },
  {
    test: (k) => /dateOfBirth|dob|birthDate|expiryDate|expiry|issueDate/i.test(k),
    mask: (v) => (v.length > 4 ? v.slice(0, 4) + "****" : v),
  },
];

function maskContextValue(key: string, value: unknown, config: LoggerConfig): unknown {
  if (typeof value !== "string" || !value) return value;

  if (!config.maskDocumentNumber) {
    const docPatterns = SENSITIVE_PATTERNS.slice(0, 3);
    if (docPatterns.some((p) => p.test(key))) return value;
  }
  if (!config.maskFullName) {
    const namePatterns = SENSITIVE_PATTERNS.slice(3, 5);
    if (namePatterns.some((p) => p.test(key))) return value;
  }
  if (!config.maskImages) {
    const imagePattern = SENSITIVE_PATTERNS[5];
    if (imagePattern && imagePattern.test(key)) return value;
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(key)) {
      return pattern.mask(value);
    }
  }

  if (typeof value === "string" && value.length > 2000) {
    return value.slice(0, 2000) + "...";
  }

  return value;
}

function maskContext(context: Record<string, unknown>, config: LoggerConfig): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      masked[key] = maskNestedContext(value as Record<string, unknown>, config, key);
    } else {
      masked[key] = maskContextValue(key, value, config);
    }
  }
  return masked;
}

function maskNestedContext(
  obj: Record<string, unknown>,
  config: LoggerConfig,
  _parentKey: string,
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      masked[key] = maskNestedContext(value as Record<string, unknown>, config, key);
    } else {
      masked[key] = maskContextValue(key, value, config);
    }
  }
  return masked;
}

function extractErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      stack: error.stack ? error.stack.split("\n").slice(0, 4).join("\n") : undefined,
    };
  }
  return { error: String(error) };
}

export class Logger {
  private config: LoggerConfig;
  private context: Record<string, unknown>;

  constructor(config?: Partial<LoggerConfig>, context?: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = { ...context };
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger(this.config, { ...this.context, ...additionalContext });
  }

  private shouldLog(level: LogLevel): boolean {
    return this.config.enabled && LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.config.level);
  }

  private formatMessage(_level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const parts = [message];
    if (context && Object.keys(context).length > 0) {
      parts.push(JSON.stringify(context));
    }
    return parts.join(" ");
  }

  private log(level: LogLevel, message: string, contextOrError?: Record<string, unknown> | Error | unknown): void {
    if (!this.shouldLog(level)) return;

    let context: Record<string, unknown> = {};

    if (contextOrError instanceof Error) {
      context = extractErrorContext(contextOrError);
    } else if (typeof contextOrError === "object" && contextOrError !== null) {
      context = contextOrError as Record<string, unknown>;
    } else if (contextOrError !== undefined) {
      context = { value: contextOrError };
    }

    const mergedContext = { ...this.context, ...context };
    const masked = maskContext(mergedContext, this.config);
    const formatted = this.formatMessage(level, message, masked);

    switch (level) {
      case "DEBUG":
        console.debug(formatted);
        break;
      case "INFO":
        console.info(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "ERROR":
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown> | Error | unknown): void {
    this.log("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown> | Error | unknown): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown> | Error | unknown): void {
    this.log("WARN", message, context);
  }

  error(message: string, context?: Record<string, unknown> | Error | unknown): void {
    this.log("ERROR", message, context);
  }
}

export const logger = new Logger();

export function configureLogging(config: Partial<LoggerConfig>): void {
  logger.configure(config);
}
