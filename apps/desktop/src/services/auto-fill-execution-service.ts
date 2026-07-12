import type { AutoFillProfile, FieldMappingEntry } from "./auto-fill-mapping-service";

export type { AutoFillProfile, FieldMappingEntry };
import type { SafetyRule, TargetSystemType } from "@guestfill/shared";
import { logger } from "../lib/logger";
import { DEFAULT_FIELD_DELAY_MS } from "../config/constants";
import { isTauri } from "../lib/isTauri";
import { invokeIpc } from "../infra/ipc";

export type FillFieldStatus = "FILLED" | "SKIPPED" | "FAILED";

export type OverallFillStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export type FillFieldResult = {
  formField: string;
  ocrField: string;
  value: string;
  maskedValue: string;
  status: FillFieldStatus;
  error?: string;
  durationMs: number;
};

export type AutoFillExecutionResult = {
  profileId: string;
  profileName: string;
  targetSystem: TargetSystemType;
  fieldResults: FillFieldResult[];
  overallStatus: OverallFillStatus;
  totalFields: number;
  filledCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type TestFillFieldPreview = {
  formField: string;
  ocrField: string;
  value: string;
  maskedValue: string;
  targetType: TargetSystemType;
  selector?: string;
  automationId?: string;
  wouldSucceed: boolean;
  warning?: string;
};

export type TestAutoFillResult = {
  profileId: string;
  profileName: string;
  targetSystem: TargetSystemType;
  previews: TestFillFieldPreview[];
  overallWouldSucceed: boolean;
  warnings: string[];
};

export type PreFillValidationErrorCode = "EMPTY_VALUE" | "INVALID_FORMAT" | "SAFETY_RULE_BLOCKED" | "MISSING_TARGET";

export type PreFillValidationError = {
  field: string;
  code: PreFillValidationErrorCode;
  message: string;
};

export type PreFillValidationResult = {
  valid: boolean;
  errors: PreFillValidationError[];
  warnings: string[];
};

export type FieldFillTarget = {
  selector?: string;
  automationId?: string;
  tabOrderIndex?: number;
  fieldType?: "text" | "select" | "checkbox" | "date";
};

export type FillOptions = {
  fieldDelayMs?: number;
  focusAppBeforeFill?: boolean;
  appWindowTitle?: string;
  appProcessName?: string;
};

export interface FillExecutor {
  fillWebField(formField: string, value: string, target?: FieldFillTarget): Promise<void>;
  fillDesktopField(value: string, target?: FieldFillTarget): Promise<void>;
  fillCopyAssistant(value: string): Promise<void>;
  focusTargetApp(windowTitle?: string, processName?: string): Promise<void>;
  clickSubmitButton(automationId: string): Promise<void>;
  clickWebSubmit(selector: string): Promise<void>;
}

export interface AutoFillExecutionService {
  executeFill(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
    fieldTargets?: Record<string, FieldFillTarget>,
    options?: FillOptions,
  ): Promise<AutoFillExecutionResult>;

  testFill(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
    fieldTargets?: Record<string, FieldFillTarget>,
  ): Promise<TestAutoFillResult>;

  validateBeforeFill(fieldValues: Record<string, string>, profile: AutoFillProfile): Promise<PreFillValidationResult>;
}

const SENSITIVE_FIELD_PATTERNS = [/passport/i, /document.?number/i, /id/i, /personal.?number/i, /national.?id/i];

function isSensitiveField(formField: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((p) => p.test(formField));
}

function maskSensitiveValue(value: string, formField: string): string {
  if (!value || !isSensitiveField(formField)) return value;
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "***" + value.slice(-1);
}

export function createAutoFillExecutionService(executor?: FillExecutor): AutoFillExecutionService {
  return new DefaultAutoFillExecutionService(executor ?? createDefaultFillExecutor());
}

export function createDefaultFillExecutor(): FillExecutor {
  return new DefaultFillExecutor();
}

class DefaultAutoFillExecutionService implements AutoFillExecutionService {
  constructor(private readonly executor: FillExecutor) {}

  async executeFill(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
    fieldTargets?: Record<string, FieldFillTarget>,
    options?: FillOptions,
  ): Promise<AutoFillExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();

    logger.info("AutoFillExecutionService: starting auto-fill", {
      profileId: profile.id,
      profileName: profile.name,
      targetSystem: profile.targetSystem,
      fieldCount: Object.keys(fieldValues).length,
    });

    const validation = await this.validateBeforeFill(fieldValues, profile);
    if (!validation.valid) {
      logger.warn("AutoFillExecutionService: pre-fill validation failed", {
        errors: validation.errors,
      });
      return this.buildFailedResult(fieldValues, profile, validation.errors, startedAt, startTime);
    }

    if (options?.focusAppBeforeFill) {
      try {
        await this.executor.focusTargetApp(options.appWindowTitle, options.appProcessName);
      } catch (error) {
        logger.warn("AutoFillExecutionService: failed to focus target app", error);
      }
    }

    const fieldResults: FillFieldResult[] = [];
    const enabledMappings = profile.mappings.filter((m) => m.enabled);
    const fieldDelay = options?.fieldDelayMs ?? DEFAULT_FIELD_DELAY_MS;

    for (const mapping of enabledMappings) {
      const value = fieldValues[mapping.formField];
      if (value === undefined || value === null) {
        fieldResults.push(this.skippedField(mapping, "No value available"));
        continue;
      }

      const target = fieldTargets?.[mapping.formField];
      const result = await this.executeFieldFill(mapping, value, profile.targetSystem, target);
      fieldResults.push(result);

      if (fieldDelay > 0) {
        await this.sleep(fieldDelay);
      }
    }

    const completedAt = new Date().toISOString();
    const totalFields = fieldResults.length;
    const filledCount = fieldResults.filter((r) => r.status === "FILLED").length;
    const failedCount = fieldResults.filter((r) => r.status === "FAILED").length;
    const skippedCount = fieldResults.filter((r) => r.status === "SKIPPED").length;

    const overallStatus: OverallFillStatus =
      failedCount === 0 && skippedCount === 0 ? "SUCCESS" : filledCount > 0 ? "PARTIAL" : "FAILED";

    const result: AutoFillExecutionResult = {
      profileId: profile.id,
      profileName: profile.name,
      targetSystem: profile.targetSystem,
      fieldResults,
      overallStatus,
      totalFields,
      filledCount,
      failedCount,
      skippedCount,
      startedAt,
      completedAt,
      durationMs: Math.round(performance.now() - startTime),
    };

    logger.info("AutoFillExecutionService: auto-fill completed", {
      overallStatus: result.overallStatus,
      filledCount: result.filledCount,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      durationMs: result.durationMs,
    });

    return result;
  }

  async testFill(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
    fieldTargets?: Record<string, FieldFillTarget>,
  ): Promise<TestAutoFillResult> {
    logger.info("AutoFillExecutionService: test mode", {
      profileId: profile.id,
      profileName: profile.name,
      fieldCount: Object.keys(fieldValues).length,
    });

    const validation = await this.validateBeforeFill(fieldValues, profile);
    const warnings: string[] = [];

    if (!validation.valid) {
      warnings.push(...validation.errors.map((e) => e.message));
    }

    const previews: TestFillFieldPreview[] = [];
    const enabledMappings = profile.mappings.filter((m) => m.enabled);

    for (const mapping of enabledMappings) {
      const value = fieldValues[mapping.formField];
      const target = fieldTargets?.[mapping.formField];

      const wouldSucceed = value !== undefined && value !== null && value !== "";
      if (!wouldSucceed) {
        warnings.push(`Field "${mapping.formField}" has no value`);
      }

      previews.push({
        formField: mapping.formField,
        ocrField: mapping.ocrField,
        value: value ?? "",
        maskedValue: maskSensitiveValue(value ?? "", mapping.formField),
        targetType: profile.targetSystem,
        selector: target?.selector,
        automationId: target?.automationId,
        wouldSucceed,
        warning: wouldSucceed ? undefined : "No value available",
      });
    }

    const overallWouldSucceed = previews.every((p) => p.wouldSucceed);

    return {
      profileId: profile.id,
      profileName: profile.name,
      targetSystem: profile.targetSystem,
      previews,
      overallWouldSucceed,
      warnings,
    };
  }

  async validateBeforeFill(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
  ): Promise<PreFillValidationResult> {
    const errors: PreFillValidationError[] = [];
    const warnings: string[] = [];

    const requiredMappings = profile.mappings.filter((m) => m.required && m.enabled);
    for (const mapping of requiredMappings) {
      const value = fieldValues[mapping.formField];
      if (!value || value.trim() === "") {
        errors.push({
          field: mapping.formField,
          code: "EMPTY_VALUE",
          message: `Required field "${mapping.formField}" has no value`,
        });
      }
    }

    const allMappings = profile.mappings.filter((m) => m.enabled);
    for (const mapping of allMappings) {
      const value = fieldValues[mapping.formField];
      if (value !== undefined && value !== "") {
        const formatError = this.validateFieldFormat(mapping.formField, value);
        if (formatError) {
          errors.push(formatError);
        }
      }
    }

    for (const rule of profile.safetyRules) {
      const safetyError = this.evaluateSafetyRule(rule, fieldValues);
      if (safetyError) {
        errors.push(safetyError);
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      logger.info("AutoFillExecutionService: validation passed", {
        profileId: profile.id,
      });
    } else {
      logger.warn("AutoFillExecutionService: validation issues found", {
        errorCount: errors.length,
        warningCount: warnings.length,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async executeFieldFill(
    mapping: FieldMappingEntry,
    value: string,
    targetSystem: TargetSystemType,
    target?: FieldFillTarget,
  ): Promise<FillFieldResult> {
    const startTime = performance.now();

    try {
      switch (targetSystem) {
        case "web":
          await this.executor.fillWebField(mapping.formField, value, target);
          break;
        case "desktop":
          await this.executor.fillDesktopField(value, target);
          break;
        case "copy_assistant":
          await this.executor.fillCopyAssistant(value);
          break;
      }

      const durationMs = Math.round(performance.now() - startTime);

      logger.info("AutoFillExecutionService: field filled", {
        formField: mapping.formField,
        ocrField: mapping.ocrField,
        maskedValue: this.maskInLog(value, mapping.formField),
        durationMs,
      });

      return {
        formField: mapping.formField,
        ocrField: mapping.ocrField,
        value,
        maskedValue: maskSensitiveValue(value, mapping.formField),
        status: "FILLED",
        durationMs,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : "Unknown fill error";

      logger.error("AutoFillExecutionService: field fill failed", {
        formField: mapping.formField,
        ocrField: mapping.ocrField,
        error: errorMessage,
        durationMs,
      });

      return {
        formField: mapping.formField,
        ocrField: mapping.ocrField,
        value,
        maskedValue: maskSensitiveValue(value, mapping.formField),
        status: "FAILED",
        error: errorMessage,
        durationMs,
      };
    }
  }

  private validateFieldFormat(formField: string, value: string): PreFillValidationError | null {
    if (/date.?of.?birth|expiry.?date|issue.?date|dob|birth.?date/i.test(formField)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return {
          field: formField,
          code: "INVALID_FORMAT",
          message: `Field "${formField}" value is not a valid date (expected YYYY-MM-DD)`,
        };
      }
    }

    if (/gender|sex/i.test(formField)) {
      if (!["M", "F", "X", "UNKNOWN"].includes(value.toUpperCase())) {
        return {
          field: formField,
          code: "INVALID_FORMAT",
          message: `Field "${formField}" value is not a valid gender`,
        };
      }
    }

    return null;
  }

  private evaluateSafetyRule(rule: SafetyRule, fieldValues: Record<string, string>): PreFillValidationError | null {
    switch (rule.type) {
      case "field_exists": {
        const fieldName = rule.config?.field;
        if (fieldName && !fieldValues[fieldName]) {
          return {
            field: fieldName,
            code: "SAFETY_RULE_BLOCKED",
            message: `Safety rule "field_exists" failed: "${fieldName}" has no value`,
          };
        }
        break;
      }
      case "page_url_matches":
      case "window_title_matches":
      case "no_popup":
        break;
    }
    return null;
  }

  private skippedField(mapping: FieldMappingEntry, reason: string): FillFieldResult {
    return {
      formField: mapping.formField,
      ocrField: mapping.ocrField,
      value: "",
      maskedValue: "",
      status: "SKIPPED",
      error: reason,
      durationMs: 0,
    };
  }

  private buildFailedResult(
    fieldValues: Record<string, string>,
    profile: AutoFillProfile,
    errors: PreFillValidationError[],
    startedAt: string,
    startTime: number,
  ): AutoFillExecutionResult {
    const fieldResults: FillFieldResult[] = profile.mappings
      .filter((m) => m.enabled)
      .map((m) => ({
        formField: m.formField,
        ocrField: m.ocrField,
        value: fieldValues[m.formField] ?? "",
        maskedValue: maskSensitiveValue(fieldValues[m.formField] ?? "", m.formField),
        status: "FAILED",
        error: errors.find((e) => e.field === m.formField)?.message ?? "Pre-fill validation failed",
        durationMs: 0,
      }));

    return {
      profileId: profile.id,
      profileName: profile.name,
      targetSystem: profile.targetSystem,
      fieldResults,
      overallStatus: "FAILED",
      totalFields: fieldResults.length,
      filledCount: 0,
      failedCount: fieldResults.length,
      skippedCount: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  private maskInLog(value: string, formField: string): string {
    if (!value) return "";
    if (isSensitiveField(formField)) {
      if (value.length <= 4) return "****";
      return value.slice(0, 2) + "***" + value.slice(-1);
    }
    return value;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class DefaultFillExecutor implements FillExecutor {
  async fillWebField(formField: string, value: string, target?: FieldFillTarget): Promise<void> {
    if (isTauri()) {
      const selector = target?.selector ?? `[name="${formField}"]`;
      try {
        await invokeIpc("fill_web_field", { selector, value });
        return;
      } catch {
        /* fall through to clipboard fallback */
      }
    }
    await this.copyToClipboard(value);
  }

  async fillDesktopField(value: string, target?: FieldFillTarget): Promise<void> {
    if (isTauri()) {
      const automationId = target?.automationId;
      if (automationId) {
        try {
          await invokeIpc("fill_desktop_field", { automationId, value });
          return;
        } catch {
          /* fall through to clipboard fallback */
        }
      }
    }
    await this.copyToClipboard(value);
  }

  async fillCopyAssistant(value: string): Promise<void> {
    await this.copyToClipboard(value);
  }

  async focusTargetApp(windowTitle?: string, processName?: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invokeIpc("focus_app_window", { windowTitle, processName });
    } catch (error) {
      logger.warn("AutoFillExecutionService: focusTargetApp failed", error);
    }
  }

  async clickSubmitButton(automationId: string): Promise<void> {
    if (!isTauri()) return;
    await invokeIpc("click_submit_button", { automationId });
  }

  async clickWebSubmit(selector: string): Promise<void> {
    if (isTauri()) {
      try {
        await invokeIpc("fill_web_field", { selector, value: "" });
      } catch {
        /* fallback: try clicking via injected JS in browser extension */
      }
    }
  }

  private async copyToClipboard(value: string): Promise<void> {
    try {
      if (isTauri()) {
        const { writeText } = await import("@tauri-apps/api/clipboard");
        await writeText(value);
        return;
      }
    } catch {
      /* fall through to navigator.clipboard */
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch (clipboardError) {
      throw new Error(
        `Clipboard write failed: ${clipboardError instanceof Error ? clipboardError.message : "Unknown"}`,
      );
    }
  }
}
