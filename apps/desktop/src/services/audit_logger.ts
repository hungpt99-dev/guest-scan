import { maskPassportNumber, maskFullName } from "@guestfill/shared";

export type AuditLogArtifactType =
  | "original_image"
  | "corrected_document"
  | "mrz_crop"
  | "visual_field_crop"
  | "ocr_raw_text"
  | "mrz_cleaned_text"
  | "mrz_repair_candidates"
  | "check_digit_results"
  | "final_selected_values"
  | "confidence_details"
  | "warning_list";

export type AuditLogImageArtifact = {
  type: "original_image" | "corrected_document";
  imagePath: string;
  filePath: string;
  width?: number;
  height?: number;
};

export type AuditLogMrzCropArtifact = {
  type: "mrz_crop";
  imagePath: string;
  filePath: string;
  variantName?: string;
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
};

export type AuditLogVisualFieldCropArtifact = {
  type: "visual_field_crop";
  fieldName: string;
  imagePath: string;
  filePath: string;
  zone?: { x: number; y: number; width: number; height: number };
};

export type AuditLogOcrRawTextArtifact = {
  type: "ocr_raw_text";
  source: "mrz" | "visual" | "fallback";
  text: string;
  confidence: number;
  variantName?: string;
  lines?: string[];
};

export type AuditLogMrzCleanedTextArtifact = {
  type: "mrz_cleaned_text";
  variantName: string;
  rawText: string;
  cleanedText: string;
  lines: string[];
};

export type MrzRepairCandidate = {
  description: string;
  changes: Record<string, { from: string; to: string }>;
  passedCheckDigits: number;
  totalCheckDigits: number;
};

export type AuditLogMrzRepairCandidatesArtifact = {
  type: "mrz_repair_candidates";
  candidates: MrzRepairCandidate[];
};

export type AuditLogCheckDigitResultsArtifact = {
  type: "check_digit_results";
  results: Record<string, boolean>;
  overallValid: boolean;
};

export type AuditLogFinalSelectedValuesArtifact = {
  type: "final_selected_values";
  values: Record<string, string>;
};

export type FieldConfidenceDetail = {
  score: number;
  level: string;
  issues: string[];
};

export type OverallConfidenceDetail = {
  overallScore: number;
  overallLevel: string;
  fieldCount: number;
  validFieldCount: number;
};

export type AuditLogConfidenceDetailsArtifact = {
  type: "confidence_details";
  fieldScores: Record<string, FieldConfidenceDetail>;
  overall: OverallConfidenceDetail;
};

export type AuditLogWarningListArtifact = {
  type: "warning_list";
  warnings: string[];
};

export type AuditLogArtifact =
  | AuditLogImageArtifact
  | AuditLogMrzCropArtifact
  | AuditLogVisualFieldCropArtifact
  | AuditLogOcrRawTextArtifact
  | AuditLogMrzCleanedTextArtifact
  | AuditLogMrzRepairCandidatesArtifact
  | AuditLogCheckDigitResultsArtifact
  | AuditLogFinalSelectedValuesArtifact
  | AuditLogConfidenceDetailsArtifact
  | AuditLogWarningListArtifact;

export type AuditLogConfig = {
  debugMode: boolean;
  logDir: string;
  retentionDays: number;
  maskSensitiveData: boolean;
  maxLogEntries: number;
};

export const DEFAULT_AUDIT_LOG_CONFIG: AuditLogConfig = {
  debugMode: false,
  logDir: "ocr_debug",
  retentionDays: 7,
  maskSensitiveData: true,
  maxLogEntries: 100,
};

export type AuditLogSession = {
  sessionId: string;
  imagePath: string;
  startTime: string;
  endTime?: string;
  artifacts: AuditLogArtifact[];
  config: AuditLogConfig;
};

export interface AuditLoggerService {
  readonly config: AuditLogConfig;

  startSession(imagePath: string): AuditLogSession;

  addArtifact(session: AuditLogSession, artifact: AuditLogArtifact): void;

  logDebugArtifacts(sessionId: string): AuditLogSession | undefined;

  finalizeSession(session: AuditLogSession): void;

  getSessions(): AuditLogSession[];

  getSession(sessionId: string): AuditLogSession | undefined;

  clearOldSessions(maxAgeDays?: number): void;

  clearSession(sessionId: string): void;

  clearAll(): void;

  isDebugMode(): boolean;

  setDebugMode(enabled: boolean): void;

  getArtifactByType(sessionId: string, type: AuditLogArtifactType): AuditLogArtifact[];
}

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `ocr_${timestamp}_${random}_${sessionCounter}`;
}

function maskSensitiveValues(artifact: AuditLogArtifact, config: AuditLogConfig): AuditLogArtifact {
  if (!config.maskSensitiveData) return artifact;

  switch (artifact.type) {
    case "final_selected_values": {
      const masked: Record<string, string> = {};
      for (const [key, value] of Object.entries(artifact.values)) {
        if (/passport|document|idNumber/i.test(key)) {
          masked[key] = maskPassportNumber(value);
        } else if (/fullName|surname|given/i.test(key)) {
          masked[key] = maskFullName(value);
        } else {
          masked[key] = value;
        }
      }
      return { ...artifact, values: masked };
    }
    case "ocr_raw_text": {
      const sensitivePattern = /[A-Z]{2}[A-Z0-9<]{6,}/g;
      return {
        ...artifact,
        text: artifact.text.replace(sensitivePattern, (m) => maskPassportNumber(m)),
      };
    }
    case "mrz_cleaned_text": {
      const sensitivePattern = /[A-Z]{2}[A-Z0-9<]{6,}/g;
      return {
        ...artifact,
        rawText: artifact.rawText.replace(sensitivePattern, (m) => maskPassportNumber(m)),
        cleanedText: artifact.cleanedText.replace(sensitivePattern, (m) => maskPassportNumber(m)),
      };
    }
    default:
      return artifact;
  }
}

class DefaultAuditLoggerService implements AuditLoggerService {
  private sessions: Map<string, AuditLogSession> = new Map();
  private _config: AuditLogConfig;

  constructor(config?: Partial<AuditLogConfig>) {
    this._config = { ...DEFAULT_AUDIT_LOG_CONFIG, ...config };
  }

  get config(): AuditLogConfig {
    return { ...this._config };
  }

  startSession(imagePath: string): AuditLogSession {
    const session: AuditLogSession = {
      sessionId: generateSessionId(),
      imagePath,
      startTime: new Date().toISOString(),
      artifacts: [],
      config: { ...this._config },
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  addArtifact(session: AuditLogSession, artifact: AuditLogArtifact): void {
    if (!this._config.debugMode) return;

    if (session.artifacts.length >= this._config.maxLogEntries) {
      return;
    }

    const masked = maskSensitiveValues(artifact, this._config);
    session.artifacts.push(masked);
  }

  logDebugArtifacts(sessionId: string): AuditLogSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return session;
  }

  finalizeSession(session: AuditLogSession): void {
    session.endTime = new Date().toISOString();
    this.logDebugArtifacts(session.sessionId);
  }

  getSessions(): AuditLogSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): AuditLogSession | undefined {
    return this.sessions.get(sessionId);
  }

  clearOldSessions(maxAgeDays?: number): void {
    const age = maxAgeDays ?? this._config.retentionDays;
    const cutoff = Date.now() - age * 24 * 60 * 60 * 1000;

    for (const [id, session] of this.sessions) {
      const sessionTime = new Date(session.startTime).getTime();
      if (sessionTime < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clearAll(): void {
    this.sessions.clear();
  }

  isDebugMode(): boolean {
    return this._config.debugMode;
  }

  setDebugMode(enabled: boolean): void {
    this._config.debugMode = enabled;
  }

  getArtifactByType(sessionId: string, type: AuditLogArtifactType): AuditLogArtifact[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.artifacts.filter((a) => a.type === type);
  }
}

let defaultInstance: AuditLoggerService | null = null;

export function createAuditLoggerService(config?: Partial<AuditLogConfig>): AuditLoggerService {
  return new DefaultAuditLoggerService(config);
}

export function getAuditLoggerService(): AuditLoggerService {
  if (!defaultInstance) {
    defaultInstance = createAuditLoggerService();
  }
  return defaultInstance;
}

export function resetAuditLoggerService(): void {
  defaultInstance = null;
}
