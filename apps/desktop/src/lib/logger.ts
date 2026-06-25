const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const currentLevel: LogLevel = "INFO";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel);
}

function sanitize(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === "string") {
      return arg.length > 200 ? arg.slice(0, 200) + "..." : arg;
    }
    return arg;
  });
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("DEBUG")) console.debug("[DEBUG]", ...sanitize(args));
  },
  info: (...args: unknown[]) => {
    if (shouldLog("INFO")) console.info("[INFO]", ...sanitize(args));
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("WARN")) console.warn("[WARN]", ...sanitize(args));
  },
  error: (...args: unknown[]) => {
    if (shouldLog("ERROR")) console.error("[ERROR]", ...sanitize(args));
  },
};
