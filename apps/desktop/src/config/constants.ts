export const APP_NAME = "guestfill";
export { APP_VERSION } from "./version";

// ───────────────────────── IndexedDB ─────────────────────────
export const DB_NAME = "guestfill";
export const DB_VERSION = 2;

export const STORE_NAMES = {
  IMPORT_SESSIONS: "import_sessions",
  GUEST_ROWS: "guest_rows",
  TARGET_TEMPLATES: "target_templates",
  FILL_EVENTS: "fill_events",
  SETTINGS: "settings",
  AUTO_FILL_PROFILES: "auto_fill_profiles",
  AUDIT_LOGS: "audit_logs",
} as const;

export const SETTINGS_KEY = "app_settings";
export const FILL_SETTINGS_KEY = "fill_settings";

// ───────────────────────── File extensions ───────────────────
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp"] as const;
export const PDF_EXTENSION = ".pdf" as const;

export const ACCEPTED_IMAGE_TYPES = IMAGE_EXTENSIONS.join(",");
export const ACCEPTED_OCR_FILE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp", ".pdf"].join(",");

export const SUPPORTED_FILE_EXTENSIONS = [...IMAGE_EXTENSIONS, PDF_EXTENSION] as const;

// ───────────────────────── OCR defaults ──────────────────────
export const DEFAULT_MAX_IMAGE_WIDTH = 1800;
export const DEFAULT_PER_IMAGE_TIMEOUT_SECONDS = 45;
export const DEFAULT_PER_CANDIDATE_TIMEOUT_SECONDS = 8;
export const OCR_TIMEOUT_MS = 300_000;

export const DEFAULT_EXPORT_FILENAME = "guestfill_export.xlsx";
export const SPREADSHEET_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const OCR_CONFIDENCE_THRESHOLD = 0.6;

// ───────────────────────── MRZ detection ─────────────────────
export const MRZ_BOTTOM_PORTION_START = 0.65;
export const MRZ_MIN_HEIGHT_RATIO = 0.06;
export const MRZ_MAX_HEIGHT_RATIO = 0.35;
export const MRZ_MIN_LINE_HEIGHT_PX = 12;
export const TEXT_DENSITY_THRESHOLD = 0.12;
export const PROJECTION_SMOOTH_WINDOW = 3;
export const LINE_DETECTION_THRESHOLD = 0.2;
export const DARK_LUMINANCE_THRESHOLD = 128;
export const MIN_TEXT_BAND_COUNT = 2;
export const BAND_DENSITY_DIFF_THRESHOLD = 0.05;

export const MRZ_CONFIDENCE_TD1 = 0.85;
export const MRZ_CONFIDENCE_TD2_TD3 = 0.8;
export const MRZ_CONFIDENCE_UNKNOWN = 0.3;
export const MRZ_ASPECT_RATIO_THRESHOLD = 0.1;

export const JPEG_SAVE_QUALITY = 0.92;
export const MOCK_MRZ_VERTICAL_OFFSET = 20;
export const MOCK_MRZ_FIXED_WIDTH = 400;
export const MOCK_MRZ_DELAY_MS = 100;

// ───────────────────────── Image quality ──────────────────────
export const PASSPORT_MIN_WIDTH = 800;
export const PASSPORT_MIN_HEIGHT = 600;
export const BLUR_THRESHOLD = 50;
export const BRIGHTNESS_MIN = 50;
export const BRIGHTNESS_MAX = 220;
export const CONTRAST_MIN = 30;
export const SKEW_THRESHOLD_DEGREES = 5;
export const GLARE_THRESHOLD = 0.15;
export const EDGE_VISIBILITY_THRESHOLD = 0.3;

// ───────────────────────── Confidence scoring ────────────────
export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;
export const CHECK_DIGIT_BONUS = 0.1;
export const CHECK_DIGIT_PENALTY = 0.2;
export const EMPTY_FIELD_PENALTY = 0.2;
export const INVALID_DATE_PENALTY = 0.15;
export const GENDER_BONUS = 0.05;
export const DOC_TYPE_BONUS = 0.05;
export const INVALID_COUNTRY_PENALTY = 0.25;
export const LOW_OCR_PENALTY = 0.15;
export const QUALITY_PENALTY_CAP = 0.3;

// ───────────────────────── Logging ───────────────────────────
export const LOG_VALUE_TRUNCATE_LENGTH = 2000;
export const LOG_TRUNCATION_SUFFIX = "...";
export const LOG_STACK_LINE_LIMIT = 4;

export const MASK_MRZ_SHOW_CHARS = 8;
export const MASK_MRZ_SUFFIX = "***";
export const MASK_SHORT_VALUE_LENGTH = 4;
export const MASK_SHOW_CHARS = 2;
export const MASK_REDACTED = "[REDACTED]";

// ───────────────────────── Camera defaults ───────────────────
export const DEFAULT_CAMERA_WIDTH = 1280;
export const DEFAULT_CAMERA_HEIGHT = 720;

// ───────────────────────── Image retention defaults ──────────
export const DEFAULT_RETENTION_MAX_AGE_DAYS = 7;
export const DEFAULT_RETENTION_MAX_IMAGES = 100;

// ───────────────────────── Auto-fill ─────────────────────────
export const DEFAULT_FIELD_DELAY_MS = 100;
export const DEFAULT_TARGET_SYSTEM_ID = "copy_assistant";
export const DEFAULT_DATE_DISPLAY_FORMAT = "yyyy-MM-dd";
export const DEFAULT_TEMPLATE_TYPE = "copy_assistant";
export const DEFAULT_TEMPLATE_VERSION = "1.0.0";
export const DEFAULT_TEMPLATE_SAVE_MODE = "manual";

export const MAX_QUICK_FIXES = 5;
export const COPY_ACCURACY_THRESHOLD = 0.7;
export const FUZZY_NAME_SIMILARITY_THRESHOLD = 0.7;

// ───────────────────────── MRZ checksum / date ────────────────
export const MRZ_WEIGHTS = [7, 3, 1] as const;
export const MRZ_CHECK_DIGIT_MODULO = 10;
export const MRZ_DATE_CENTURY_THRESHOLD = 49;

export const TD3_LINE_LENGTH = 44;
export const TD2_LINE_LENGTH = 36;
export const TD1_LINE_LENGTH = 30;

// ───────────────────────── Audit log ─────────────────────────
export const DEFAULT_AUDIT_RETENTION_DAYS = 90;
export const DEFAULT_AUDIT_MAX_ENTRIES = 10_000;
export const DEFAULT_AUDIT_QUERY_LIMIT = 50;

// ──────────────────── Clipboard / safety ─────────────────────
export const DEFAULT_CLEAR_CLIPBOARD_AFTER_SECONDS = 60;
export const DEFAULT_LOCAL_BRIDGE_PORT = 43175;
export const NEAR_EXPIRY_WARNING_DAYS = 90;

// ────────────────────── Preprocessing ────────────────────────
export const DEFAULT_PREPROCESS_TARGET_HEIGHT = 1200;

// ────────────────── Pipeline progress weights ────────────────
export const PROGRESS_QUALITY_CHECK = 5;
export const PROGRESS_DOCUMENT_CROP = 20;
export const PROGRESS_PREPROCESSING = 35;
export const PROGRESS_MRZ_DETECTION = 50;
export const PROGRESS_OCR = 60;
export const PROGRESS_MRZ_PARSE = 75;
export const PROGRESS_CHECKSUM_VALIDATION = 80;
export const PROGRESS_FIELD_NORMALIZATION = 85;
export const PROGRESS_CONFIDENCE_SCORING = 90;
export const PROGRESS_STAFF_REVIEW = 95;
export const PROGRESS_COMPLETE = 100;

// ──────────────── Mock delays (ms) ───────────────────────────
export const MOCK_CROP_DELAY_MS = 200;
export const MOCK_QUALITY_DELAY_MS = 150;
export const MOCK_PREPROCESS_DELAY_MS = 200;
export const MOCK_PREPROCESS_WORN_DELAY_MS = 350;
export const MOCK_PREPROCESS_CONTRAST_DELAY_MS = 300;
export const MOCK_PREPROCESS_GLARE_DELAY_MS = 400;

// ──────────────────── Staff review ───────────────────────────
export const STAFF_REVIEW_MASK_OFFSET = 3;
