import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEnvConfig, loadEnvVars, getEnvVars, reloadEnvVars, ENV_VAR_DEFINITIONS } from "../../config/env";

describe("env config", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    reloadEnvVars();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getEnvConfig", () => {
    it("detects test environment when NODE_ENV is test", () => {
      const config = getEnvConfig();
      expect(config.environment).toBe("test");
      expect(config.isTest).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it("detects production environment", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const config = getEnvConfig();
        expect(config.environment).toBe("production");
        expect(config.isProduction).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  describe("ENV_VAR_DEFINITIONS", () => {
    it("includes logLevel definition", () => {
      const def = ENV_VAR_DEFINITIONS.find((d) => d.key === "logLevel");
      expect(def).toBeDefined();
      expect(def!.defaultValue).toBe("INFO");
    });

    it("logLevel validates correctly", () => {
      const def = ENV_VAR_DEFINITIONS.find((d) => d.key === "logLevel");
      const validate = def!.validate as ((v: string) => string | null) | undefined;
      expect(validate).toBeDefined();
      expect(validate!("INFO")).toBeNull();
      expect(validate!("DEBUG")).toBeNull();
      expect(validate!("INVALID")).toContain("Invalid log level");
    });

    it("includes enableOnlineOcr with default false", () => {
      const def = ENV_VAR_DEFINITIONS.find((d) => d.key === "enableOnlineOcr");
      expect(def).toBeDefined();
      expect(def!.defaultValue).toBe(false);
    });

    it("localBridgePort validates port range", () => {
      const def = ENV_VAR_DEFINITIONS.find((d) => d.key === "localBridgePort");
      const validate = def!.validate as ((v: number) => string | null) | undefined;
      expect(validate).toBeDefined();
      expect(validate!(43175)).toBeNull();
      expect(validate!(-1)).toContain("Invalid port");
      expect(validate!(70000)).toContain("Invalid port");
    });
  });

  describe("loadEnvVars", () => {
    it("loads default values when no env vars set", () => {
      const vars = loadEnvVars();
      expect(vars.logLevel).toBe("INFO");
      expect(vars.enableOnlineOcr).toBe(false);
      expect(vars.localBridgePort).toBe(43175);
      expect(vars.azureEndpoint).toBe("");
      expect(vars.azureApiKey).toBe("");
    });

    it("parses boolean env vars correctly", () => {
      vi.stubGlobal("process", {
        env: { GUESTFILL_ENABLE_ONLINE_OCR: "true" },
      });
      reloadEnvVars();
      const vars = getEnvVars();
      expect(vars.enableOnlineOcr).toBe(true);
    });

    it("parses number env vars correctly", () => {
      vi.stubGlobal("process", {
        env: { GUESTFILL_LOCAL_BRIDGE_PORT: "5000" },
      });
      reloadEnvVars();
      const vars = getEnvVars();
      expect(vars.localBridgePort).toBe(5000);
    });

    it("falls back to default for invalid port", () => {
      vi.stubGlobal("process", {
        env: { GUESTFILL_LOCAL_BRIDGE_PORT: "not-a-number" },
      });
      reloadEnvVars();
      const vars = getEnvVars();
      expect(vars.localBridgePort).toBe(43175);
    });

    it("caches env vars", () => {
      const a = getEnvVars();
      const b = getEnvVars();
      expect(a).toBe(b);
    });
  });

  describe("reloadEnvVars", () => {
    it("reloads and returns fresh values", () => {
      const a = getEnvVars();
      const b = reloadEnvVars();
      expect(a).not.toBe(b);
    });
  });
});
