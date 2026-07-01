export type OcrWarningSeverity = "ERROR" | "WARNING" | "INFO";

export type OcrWarningCategory = "IMAGE_QUALITY" | "MRZ_PARSING" | "FIELD_VALIDATION" | "CONFIDENCE" | "GENERAL";

export type OcrWarningDefinition = {
  severity: OcrWarningSeverity;
  category: OcrWarningCategory;
  description: string;
};

export type OcrWarning =
  | "BLUR_DETECTED"
  | "GLARE_DETECTED"
  | "LOW_RESOLUTION"
  | "DOCUMENT_NOT_FULLY_VISIBLE"
  | "MRZ_NOT_FOUND"
  | "MRZ_CUT_OFF"
  | "MRZ_REPAIRED"
  | "MRZ_CHECK_DIGIT_FAILED"
  | "PASSPORT_NUMBER_REPAIRED"
  | "DOB_REPAIRED"
  | "EXPIRY_REPAIRED"
  | "COUNTRY_CODE_REPAIRED"
  | "VISUAL_MRZ_CONFLICT"
  | "CREASE_DETECTED"
  | "LOW_BRIGHTNESS"
  | "OVEREXPOSED"
  | "STRONG_ROTATION"
  | "PERSPECTIVE_DISTORTION"
  | "LOW_CONFIDENCE_FIELD"
  | "HUMAN_REVIEW_REQUIRED";

export const OCR_WARNING_DEFINITIONS: Record<OcrWarning, OcrWarningDefinition> = {
  BLUR_DETECTED: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Image is blurry or lacks sharpness",
  },
  GLARE_DETECTED: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Glare or reflection detected on document surface",
  },
  LOW_RESOLUTION: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Image resolution is too low for reliable OCR",
  },
  DOCUMENT_NOT_FULLY_VISIBLE: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Document edges not fully visible in frame",
  },
  MRZ_NOT_FOUND: {
    severity: "ERROR",
    category: "MRZ_PARSING",
    description: "MRZ zone could not be detected or parsed",
  },
  MRZ_CUT_OFF: {
    severity: "WARNING",
    category: "MRZ_PARSING",
    description: "MRZ zone appears cut off or incomplete",
  },
  MRZ_REPAIRED: {
    severity: "WARNING",
    category: "MRZ_PARSING",
    description: "MRZ data was repaired using check digit validation",
  },
  MRZ_CHECK_DIGIT_FAILED: {
    severity: "ERROR",
    category: "MRZ_PARSING",
    description: "MRZ check digit validation failed for one or more fields",
  },
  PASSPORT_NUMBER_REPAIRED: {
    severity: "WARNING",
    category: "FIELD_VALIDATION",
    description: "Passport number was repaired using OCR error correction",
  },
  DOB_REPAIRED: {
    severity: "WARNING",
    category: "FIELD_VALIDATION",
    description: "Date of birth was repaired using OCR error correction",
  },
  EXPIRY_REPAIRED: {
    severity: "WARNING",
    category: "FIELD_VALIDATION",
    description: "Expiry date was repaired using OCR error correction",
  },
  COUNTRY_CODE_REPAIRED: {
    severity: "WARNING",
    category: "FIELD_VALIDATION",
    description: "Country code was repaired using known patterns",
  },
  VISUAL_MRZ_CONFLICT: {
    severity: "WARNING",
    category: "FIELD_VALIDATION",
    description: "Visual OCR data conflicts with MRZ data",
  },
  CREASE_DETECTED: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Large crease detected across important document fields",
  },
  LOW_BRIGHTNESS: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Image is too dark for reliable OCR",
  },
  OVEREXPOSED: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Image is overexposed, losing detail in bright areas",
  },
  STRONG_ROTATION: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Document has strong rotation or skew",
  },
  PERSPECTIVE_DISTORTION: {
    severity: "WARNING",
    category: "IMAGE_QUALITY",
    description: "Document has significant perspective distortion",
  },
  LOW_CONFIDENCE_FIELD: {
    severity: "WARNING",
    category: "CONFIDENCE",
    description: "One or more fields have low confidence scores",
  },
  HUMAN_REVIEW_REQUIRED: {
    severity: "ERROR",
    category: "GENERAL",
    description: "Human review is required to verify extracted data",
  },
};

export type OcrWarningEvent = {
  warning: OcrWarning;
  timestamp: number;
  source: string;
  field?: string;
};

export interface OcrWarningService {
  readonly warnings: readonly OcrWarning[];
  add(warning: OcrWarning, source?: string): void;
  addIfAbsent(warning: OcrWarning, source?: string): void;
  addAll(warnings: OcrWarning[]): void;
  merge(warnings: OcrWarning[]): void;
  has(warning: OcrWarning): boolean;
  remove(warning: OcrWarning): void;
  clear(): void;
  getWarnings(): OcrWarning[];
  getAll(): OcrWarning[];
  getCount(): number;
  getBySeverity(severity: OcrWarningSeverity): OcrWarning[];
  getByCategory(category: OcrWarningCategory): OcrWarning[];
  hasSeverity(severity: OcrWarningSeverity): boolean;
  getMetadata(warning: OcrWarning): OcrWarningDefinition;
  toJSON(): { warnings: OcrWarning[]; count: number };
}

class DefaultOcrWarningService implements OcrWarningService {
  private _warnings: OcrWarning[] = [];

  get warnings(): readonly OcrWarning[] {
    return this._warnings;
  }

  add(warning: OcrWarning, _source?: string): void {
    if (!this._warnings.includes(warning)) {
      this._warnings.push(warning);
    }
  }

  addIfAbsent(warning: OcrWarning, _source?: string): void {
    if (!this._warnings.includes(warning)) {
      this._warnings.push(warning);
    }
  }

  addAll(warnings: OcrWarning[]): void {
    for (const w of warnings) {
      this.addIfAbsent(w);
    }
  }

  merge(warnings: OcrWarning[]): void {
    this.addAll(warnings);
  }

  has(warning: OcrWarning): boolean {
    return this._warnings.includes(warning);
  }

  remove(warning: OcrWarning): void {
    const idx = this._warnings.indexOf(warning);
    if (idx !== -1) {
      this._warnings.splice(idx, 1);
    }
  }

  clear(): void {
    this._warnings = [];
  }

  getWarnings(): OcrWarning[] {
    return [...this._warnings];
  }

  getAll(): OcrWarning[] {
    return [...this._warnings];
  }

  getCount(): number {
    return this._warnings.length;
  }

  getBySeverity(severity: OcrWarningSeverity): OcrWarning[] {
    return this._warnings.filter((w) => OCR_WARNING_DEFINITIONS[w].severity === severity);
  }

  getByCategory(category: OcrWarningCategory): OcrWarning[] {
    return this._warnings.filter((w) => OCR_WARNING_DEFINITIONS[w].category === category);
  }

  hasSeverity(severity: OcrWarningSeverity): boolean {
    return this._warnings.some((w) => OCR_WARNING_DEFINITIONS[w].severity === severity);
  }

  getMetadata(warning: OcrWarning): OcrWarningDefinition {
    return OCR_WARNING_DEFINITIONS[warning];
  }

  toJSON(): { warnings: OcrWarning[]; count: number } {
    return {
      warnings: this.getWarnings(),
      count: this._warnings.length,
    };
  }
}

export function createOcrWarningService(): OcrWarningService {
  return new DefaultOcrWarningService();
}

export function deduplicateWarnings(warnings: OcrWarning[]): OcrWarning[] {
  return [...new Set(warnings)];
}

export function mergeWarningLists(...lists: (OcrWarning[] | undefined)[]): OcrWarning[] {
  const merged: OcrWarning[] = [];
  for (const list of lists) {
    if (list) {
      for (const w of list) {
        if (!merged.includes(w)) {
          merged.push(w);
        }
      }
    }
  }
  return merged;
}
