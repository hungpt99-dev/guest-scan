import type { GuestRow, TargetSystemTemplate, ConfidenceLevel, TransformRule } from "@guestfill/shared";
import { applyTransforms } from "./transformEngine";

export type FuzzyMatchResult = {
  match: boolean;
  similarity: number;
  method: "exact" | "normalized" | "levenshtein" | "soundex";
};

export type AmbiguityWarning = {
  char: string;
  position: number;
  suggestions: string[];
};

export type AccuracyRecommendation = {
  field: string;
  priority: "high" | "medium" | "low";
  message: string;
};

export type QuickFix = {
  label: string;
  action: "replace" | "review" | "ignore";
  value?: string;
  description: string;
};

export type AggregateAccuracy = {
  overallScore: number;
  overallLevel: ConfidenceLevel;
  perField: AccuracyInfo[];
  recommendations: AccuracyRecommendation[];
};

const PASSPORT_PATTERNS: Record<string, RegExp[]> = {
  GBR: [/^\d{9}$/],
  USA: [/^\d{9}$/],
  CHN: [/^[A-Z]\d{8}$/, /^[A-Z]\d{7}$/],
  JPN: [/^[A-Z]{2}\d{7}$/],
  KOR: [/^\d{8}$/],
  RUS: [/^\d{9}$/],
  ARE: [/^[A-Z]{2}\d{7}$/],
  VNM: [/^[A-Z]\d{7}$/],
  IND: [/^[A-Z]\d{7}$/],
  FRA: [/^\d{2}[A-Z]{2}\d{5}$/],
  DEU: [/^[A-Z]\d{8}$/],
  ITA: [/^[A-Z]{2}\d{7}$/],
  ESP: [/^[A-Z]{3}\d{6}$/],
  BRA: [/^[A-Z]{2}\d{6}$/],
  CAN: [/^[A-Z]{2}\d{6}$/],
  AUS: [/^[A-Z]\d{8}$/],
  ZAF: [/^\d{8}$/],
  SGP: [/^[A-Z]\d{7}$/],
  MYS: [/^[A-Z]\d{8}$/],
  THA: [/^\d{9}$/],
  PHL: [/^[A-Z]{2}\d{7}$/],
  IDN: [/^\d{8}$/],
  MEX: [/^\d{8}$/, /^[A-Z]\d{7}$/],
  TUR: [/^[A-Z]\d{8}$/],
  NLD: [/^[A-Z]{2}\d{7}$/],
  SAU: [/^[A-Z]\d{8}$/],
  CHE: [/^\d{8}$/],
  SWE: [/^\d{8}$/],
  NOR: [/^\d{8}$/],
  DNK: [/^\d{7}$/],
  FIN: [/^[A-Z]{2}\d{7}$/],
  BEL: [/^[A-Z]{2}\d{6}$/],
  AUT: [/^\d{8}$/],
  PRT: [/^\d{8}$/],
  GRC: [/^[A-Z]{2}\d{7}$/],
  IRL: [/^\d{9}$/],
  NZL: [/^[A-Z]{2}\d{6}$/],
  POL: [/^\d{9}$/],
  CZE: [/^\d{8}$/],
  HUN: [/^\d{8}$/],
  ROU: [/^\d{8}$/],
  UKR: [/^\d{9}$/],
  ISR: [/^\d{8}$/],
  PAK: [/^[A-Z]{2}\d{7}$/],
  BGD: [/^[A-Z]\d{8}$/],
  EGY: [/^\d{9}$/],
  NGA: [/^\d{8}$/],
  KEN: [/^\d{8}$/],
  ARG: [/^[A-Z]{3}\d{6}$/],
  CHL: [/^\d{8}$/],
  COL: [/^\d{10}$/],
  HKG: [/^[A-Z]{2}\d{7}$/],
  TWN: [/^\d{9}$/],
  MMR: [/^[A-Z]\d{8}$/],
  LAO: [/^[A-Z]{2}\d{7}$/],
  KHM: [/^\d{9}$/],
};

const AMBIGUOUS_CHARS: Record<string, string[]> = {
  "0": ["O", "Q", "D"],
  O: ["0"],
  "1": ["I", "L", "l"],
  I: ["1", "l"],
  l: ["1", "I"],
  "5": ["S"],
  S: ["5"],
  "8": ["B"],
  B: ["8"],
  "2": ["Z"],
  Z: ["2"],
  "6": ["G"],
  G: ["6"],
  "9": ["g", "q"],
  g: ["9"],
  q: ["9"],
};

export function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : Math.min(dp[i - 1]![j - 1]! + 1, dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1);
    }
  }
  return dp[m]![n]!;
}

export function soundex(str: string): string {
  const upper = str.toUpperCase();
  const first = upper[0] ?? "";
  const rest = upper
    .slice(1)
    .replace(/[AEIOUHWY]/g, "")
    .replace(/[BFPV]/g, "1")
    .replace(/[CGJKQSXZ]/g, "2")
    .replace(/[DT]/g, "3")
    .replace(/[L]/g, "4")
    .replace(/[MN]/g, "5")
    .replace(/[R]/g, "6")
    .replace(/0/g, "")
    .replace(/(\d)\1+/g, "$1");
  return first + rest.padEnd(3, "0").slice(0, 3);
}

export function fuzzyMatchNames(name1: string, name2: string): FuzzyMatchResult {
  const n1 = name1.trim().toLowerCase();
  const n2 = name2.trim().toLowerCase();

  if (n1 === n2) {
    return { match: true, similarity: 1.0, method: "exact" };
  }

  const d1 = stripDiacritics(n1);
  const d2 = stripDiacritics(n2);
  if (d1 === d2) {
    return { match: true, similarity: 0.95, method: "normalized" };
  }

  const s1 = soundex(d1);
  const s2 = soundex(d2);
  if (s1 === s2 && s1.length >= 3) {
    return { match: true, similarity: 0.85, method: "soundex" };
  }

  const maxLen = Math.max(d1.length, d2.length);
  if (maxLen === 0) return { match: true, similarity: 1.0, method: "exact" };
  const dist = levenshteinDistance(d1, d2);
  const similarity = 1 - dist / maxLen;
  return {
    match: similarity >= 0.7,
    similarity,
    method: "levenshtein",
  };
}

export function getCharacterAmbiguityWarnings(value: string): AmbiguityWarning[] {
  const warnings: AmbiguityWarning[] = [];
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char && AMBIGUOUS_CHARS[char.toUpperCase()]) {
      warnings.push({
        char: value[i] ?? "",
        position: i,
        suggestions: AMBIGUOUS_CHARS[char.toUpperCase()] ?? [],
      });
    }
  }
  return warnings;
}

export const ISO3_FROM_ISO2: Record<string, string> = {
  VN: "VNM",
  US: "USA",
  KR: "KOR",
  CN: "CHN",
  JP: "JPN",
  FR: "FRA",
  DE: "DEU",
  GB: "GBR",
  IT: "ITA",
  ES: "ESP",
  CA: "CAN",
  AU: "AUS",
  BR: "BRA",
  IN: "IND",
  RU: "RUS",
  MX: "MEX",
  ID: "IDN",
  NL: "NLD",
  SA: "SAU",
  CH: "CHE",
  SE: "SWE",
  NO: "NOR",
  DK: "DNK",
  FI: "FIN",
  BE: "BEL",
  AT: "AUT",
  PT: "PRT",
  GR: "GRC",
  IE: "IRL",
  NZ: "NZL",
  SG: "SGP",
  MY: "MYS",
  TH: "THA",
  PH: "PHL",
  HK: "HKG",
  TW: "TWN",
  AR: "ARG",
  CL: "CHL",
  CO: "COL",
  ZA: "ZAF",
  EG: "EGY",
  NG: "NGA",
  KE: "KEN",
  TR: "TUR",
  PL: "POL",
  CZ: "CZE",
  HU: "HUN",
  RO: "ROU",
  UA: "UKR",
  IL: "ISR",
  AE: "ARE",
  PK: "PAK",
  BD: "BGD",
  KZ: "KAZ",
  UZ: "UZB",
  QA: "QAT",
  KW: "KWT",
  OM: "OMN",
  IR: "IRN",
  MM: "MMR",
  LA: "LAO",
  KH: "KHM",
  MO: "MAC",
  MN: "MNG",
  NP: "NPL",
  LK: "LKA",
};

const PASSPORT_FORMAT_EXAMPLES: Record<string, string> = {
  GBR: "9 digits (e.g., 123456789)",
  USA: "9 digits (e.g., 123456789)",
  CHN: "1 letter + 8 digits (e.g., E12345678) or 1 letter + 7 digits",
  JPN: "2 letters + 7 digits (e.g., AB1234567)",
  KOR: "8 digits (e.g., 12345678)",
  RUS: "9 digits (e.g., 123456789)",
  ARE: "2 letters + 7 digits (e.g., AB1234567)",
  VNM: "1 letter + 7 digits (e.g., A1234567)",
  IND: "1 letter + 7 digits (e.g., A1234567)",
  FRA: "2 digits + 2 letters + 5 digits (e.g., 12AB34567)",
  DEU: "1 letter + 8 digits (e.g., A12345678)",
  ITA: "2 letters + 7 digits (e.g., AB1234567)",
  ESP: "3 letters + 6 digits (e.g., ABC123456)",
  BRA: "2 letters + 6 digits (e.g., AB123456)",
  CAN: "2 letters + 6 digits (e.g., AB123456)",
  AUS: "1 letter + 8 digits (e.g., A12345678)",
  ZAF: "8 digits (e.g., 12345678)",
  SGP: "1 letter + 7 digits (e.g., A1234567)",
  MYS: "1 letter + 8 digits (e.g., A12345678)",
  THA: "9 digits (e.g., 123456789)",
  PHL: "2 letters + 7 digits (e.g., AB1234567)",
  IDN: "8 digits (e.g., 12345678)",
  MEX: "8 digits (e.g., 12345678) or 1 letter + 7 digits",
  TUR: "1 letter + 8 digits (e.g., A12345678)",
  NLD: "2 letters + 7 digits (e.g., AB1234567)",
  SAU: "1 letter + 8 digits (e.g., A12345678)",
  CHE: "8 digits (e.g., 12345678)",
  SWE: "8 digits (e.g., 12345678)",
  NOR: "8 digits (e.g., 12345678)",
  DNK: "7 digits (e.g., 1234567)",
  FIN: "2 letters + 7 digits (e.g., AB1234567)",
  BEL: "2 letters + 6 digits (e.g., AB123456)",
  AUT: "8 digits (e.g., 12345678)",
  PRT: "8 digits (e.g., 12345678)",
  GRC: "2 letters + 7 digits (e.g., AB1234567)",
  IRL: "9 digits (e.g., 123456789)",
  NZL: "2 letters + 6 digits (e.g., AB123456)",
  POL: "9 digits (e.g., 123456789)",
  CZE: "8 digits (e.g., 12345678)",
  HUN: "8 digits (e.g., 12345678)",
  ROU: "8 digits (e.g., 12345678)",
  UKR: "9 digits (e.g., 123456789)",
  ISR: "8 digits (e.g., 12345678)",
  PAK: "2 letters + 7 digits (e.g., AB1234567)",
  BGD: "1 letter + 8 digits (e.g., A12345678)",
  EGY: "9 digits (e.g., 123456789)",
  NGA: "8 digits (e.g., 12345678)",
  KEN: "8 digits (e.g., 12345678)",
  ARG: "3 letters + 6 digits (e.g., ABC123456)",
  CHL: "8 digits (e.g., 12345678)",
  COL: "10 digits (e.g., 1234567890)",
  HKG: "2 letters + 7 digits (e.g., AB1234567)",
  TWN: "9 digits (e.g., 123456789)",
  MMR: "1 letter + 8 digits (e.g., A12345678)",
  LAO: "2 letters + 7 digits (e.g., AB1234567)",
  KHM: "9 digits (e.g., 123456789)",
};

function describePassportPattern(iso3: string, _pattern?: RegExp): string | undefined {
  return PASSPORT_FORMAT_EXAMPLES[iso3];
}

export function validatePassportForCountry(
  passport: string,
  nationality?: string,
): { valid: boolean; message?: string } {
  if (!nationality) {
    const genericValid = /^[A-Za-z0-9]{5,20}$/.test(passport);
    return {
      valid: genericValid,
      message: genericValid ? undefined : "Invalid passport format — expected 5-20 alphanumeric characters",
    };
  }
  const iso3 = ISO3_FROM_ISO2[nationality.toUpperCase()] ?? nationality.toUpperCase();
  const patterns = PASSPORT_PATTERNS[iso3];
  if (!patterns) {
    const genericValid = /^[A-Za-z0-9]{5,20}$/.test(passport);
    return {
      valid: genericValid,
      message: genericValid ? undefined : "Invalid passport format — expected 5-20 alphanumeric characters",
    };
  }
  const upper = passport.toUpperCase();
  for (const pattern of patterns) {
    if (pattern.test(upper)) {
      return { valid: true };
    }
  }
  const expectedFormat = patterns[0]?.source ?? "alphanumeric 5-20 chars";
  const describePattern = describePassportPattern(iso3, patterns[0]);
  return {
    valid: false,
    message: describePattern
      ? `${iso3} passport numbers look like: ${describePattern}. Got: ${passport}`
      : `${iso3} passport should match: ${expectedFormat}. Got: ${passport}`,
  };
}

const MASCULINE_NAMES = new Set([
  "john",
  "james",
  "robert",
  "michael",
  "william",
  "david",
  "richard",
  "joseph",
  "thomas",
  "charles",
  "daniel",
  "matthew",
  "anthony",
  "mark",
  "donald",
  "steven",
  "paul",
  "andrew",
  "joshua",
  "kenneth",
  "kevin",
  "brian",
  "george",
  "timothy",
  "ronald",
  "edward",
  "jason",
  "jeffrey",
  "ryan",
  "jacob",
  "gary",
  "nicholas",
  "eric",
  "jonathan",
  "stephen",
  "larry",
  "justin",
  "scott",
  "brandon",
  "benjamin",
  "samuel",
  "raymond",
  "gregory",
  "frank",
  "alexander",
  "patrick",
  "jack",
  "dennis",
  "jerry",
  "tyler",
  "aaron",
  "jose",
  "nathan",
  "henry",
  "douglas",
  "peter",
  "adam",
  "nathaniel",
  "zachary",
  "dale",
  "carl",
  "gabriel",
  "miguel",
  "mario",
  "juan",
  "carlos",
  "jorge",
  "pedro",
  "victor",
  "luis",
  "antonio",
  "javier",
  "manuel",
  "joao",
  "maria",
  "wei",
  "li",
  "van",
  "duc",
  "huy",
  "hung",
  "tuan",
  "minh",
  "quang",
  "hoang",
  "nguyen",
  "tran",
  "pham",
  "le",
  "vu",
  "vo",
  "ho",
  "ngo",
  "dang",
  "ngo",
]);

const FEMININE_NAMES = new Set([
  "mary",
  "patricia",
  "jennifer",
  "linda",
  "barbara",
  "elizabeth",
  "susan",
  "jessica",
  "sarah",
  "karen",
  "lisa",
  "nancy",
  "betty",
  "margaret",
  "sandra",
  "ashley",
  "dorothy",
  "kimberly",
  "emily",
  "donna",
  "michelle",
  "carol",
  "amanda",
  "melissa",
  "deborah",
  "stephanie",
  "rebecca",
  "sharon",
  "laura",
  "cynthia",
  "kathleen",
  "amy",
  "angela",
  "shirley",
  "anna",
  "brenda",
  "pamela",
  "emma",
  "nicole",
  "helen",
  "samantha",
  "katherine",
  "christine",
  "debra",
  "rachel",
  "carolyn",
  "janet",
  "catherine",
  "olivia",
  "heather",
  "ruby",
  "maria",
  "joan",
  "joyce",
  "rose",
  "evelyn",
  "abigail",
  "elena",
  "sophia",
  "isabella",
  "marta",
  "carmen",
  "ana",
  "rosa",
  "julia",
  "laura",
  "thu",
  "lan",
  "huong",
  "hien",
  "trang",
  "thao",
  "ngoc",
  "mai",
  "linh",
  "hoa",
  "kim",
  "anh",
  "diep",
  "hanh",
  "nhung",
  "phuong",
  "quynh",
  "van",
]);

function guessNameGender(name: string): "M" | "F" | "ambiguous" {
  const normalized = stripDiacritics(name.toLowerCase()).trim();
  const parts = normalized.split(/[\s,-]+/);
  const firstName = parts[0] ?? "";
  if (MASCULINE_NAMES.has(firstName)) return "M";
  if (FEMININE_NAMES.has(firstName)) return "F";
  return "ambiguous";
}

export function getDaysUntilExpiry(dateString?: string): number | null {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return null;
  const now = new Date();
  const diff = parsed.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getCrossFieldIssues(guest: GuestRow): string[] {
  const issues: string[] = [];

  if (guest.nationality && guest.issuingCountry) {
    const normNatl = ISO3_FROM_ISO2[guest.nationality] ?? guest.nationality;
    const normIssuing = ISO3_FROM_ISO2[guest.issuingCountry] ?? guest.issuingCountry;
    if (normNatl !== normIssuing) {
      issues.push(
        `Nationality (${guest.nationality}) differs from issuing country (${guest.issuingCountry}) — verify dual citizenship`,
      );
    }
  }

  if (guest.fullName && guest.surname && guest.givenName) {
    const fullLower = stripDiacritics(guest.fullName.toLowerCase());
    const surLower = stripDiacritics(guest.surname.toLowerCase());
    const givLower = stripDiacritics(guest.givenName.toLowerCase());
    if (!fullLower.includes(surLower) && !fullLower.includes(givLower)) {
      issues.push("Full name does not contain surname or given name — check for data entry error");
    }
  }

  if (guest.dateOfBirth && guest.passportExpiryDate) {
    const dob = new Date(guest.dateOfBirth);
    const exp = new Date(guest.passportExpiryDate);
    if (!isNaN(dob.getTime()) && !isNaN(exp.getTime())) {
      if (exp <= dob) {
        issues.push("Passport expiry date is before or same as date of birth — data may be swapped");
      }
      if (guest.gender !== "UNKNOWN") {
        const ageAtExpiry = exp.getFullYear() - dob.getFullYear();
        if (ageAtExpiry > 100) {
          issues.push(`Age at passport expiry would be ${ageAtExpiry} — unusual, check date values`);
        }
      }
    }
  }

  if (guest.passportNumber && guest.nationality) {
    const validation = validatePassportForCountry(guest.passportNumber, guest.nationality);
    if (!validation.valid && validation.message) {
      issues.push(validation.message);
    }
  }

  if (guest.gender && guest.gender !== "UNKNOWN" && guest.fullName) {
    const guessed = guessNameGender(guest.fullName);
    if (guessed !== "ambiguous" && guessed !== guest.gender) {
      issues.push(
        `Name "${guest.fullName}" suggests ${guessed === "M" ? "male" : "female"} but gender is set to ${guest.gender === "M" ? "male" : "female"} — verify correctness`,
      );
    }
  }

  if (guest.dateOfBirth && guest.passportExpiryDate) {
    const dob = new Date(guest.dateOfBirth);
    const exp = new Date(guest.passportExpiryDate);
    if (!isNaN(dob.getTime()) && !isNaN(exp.getTime())) {
      const diffMs = exp.getTime() - dob.getTime();
      const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
      if (diffYears > 100 || diffYears < 15) {
        issues.push(
          `Document validity period (${Math.round(diffYears)} years) seems unusual — verify dates are not swapped between DOB and expiry`,
        );
      }
    }
  }

  return issues;
}

export function getAccuracyRecommendations(guest: GuestRow): AccuracyRecommendation[] {
  const recommendations: AccuracyRecommendation[] = [];

  if (guest.fullName && guest.fullName.length < 3) {
    if (guest.fullName.length < 2) {
      recommendations.push({
        field: "fullName",
        priority: "high",
        message: `Name is only ${guest.fullName.length} character — likely truncated or OCR failed. Check the original document image.`,
      });
    } else {
      recommendations.push({
        field: "fullName",
        priority: "high",
        message: `Name is ${guest.fullName.length} characters — check for truncation. Common with short Vietnamese or Chinese names, verify against document.`,
      });
    }
  }

  if (guest.fullName) {
    const digitRatio = (guest.fullName.match(/\d/g) ?? []).length / guest.fullName.length;
    if (digitRatio > 0.5) {
      recommendations.push({
        field: "fullName",
        priority: "high",
        message: `Name "${guest.fullName}" contains mostly digits — likely an OCR misread. Check the scanned document.`,
      });
    }

    if (guest.surname && guest.fullName === guest.surname) {
      recommendations.push({
        field: "fullName",
        priority: "medium",
        message: `Full name is identical to surname ("${guest.fullName}") — given name may be missing from OCR. Verify against document.`,
      });
    }
  }

  if (guest.passportNumber) {
    const ambiguous = getCharacterAmbiguityWarnings(guest.passportNumber);
    if (ambiguous.length > 0) {
      const suggestions = ambiguous
        .map((a) => `'${a.char}' at position ${a.position + 1} might be ${a.suggestions.join("/")}`)
        .join("; ");
      recommendations.push({
        field: "passportNumber",
        priority: "high",
        message: `Possible OCR misread in passport number: ${suggestions}. Verify the number carefully against the document.`,
      });
    }
    if (guest.nationality) {
      const valid = validatePassportForCountry(guest.passportNumber, guest.nationality);
      if (!valid.valid && valid.message) {
        recommendations.push({
          field: "passportNumber",
          priority: "high",
          message: valid.message,
        });
      }
    }
    if (/^0+$/.test(guest.passportNumber)) {
      recommendations.push({
        field: "passportNumber",
        priority: "high",
        message: `Passport number is all zeros ("${guest.passportNumber}") — this appears to be a default/placeholder value, not a real passport number.`,
      });
    }
    if (guest.passportNumber && guest.passportNumber.length < 6) {
      recommendations.push({
        field: "passportNumber",
        priority: "medium",
        message: `Passport number is only ${guest.passportNumber.length} characters — likely truncated or incomplete from OCR. Expected at least 6 characters.`,
      });
    }
  }

  if (guest.idNumber) {
    const ambiguous = getCharacterAmbiguityWarnings(guest.idNumber);
    if (ambiguous.length > 0) {
      const suggestions = ambiguous
        .map((a) => `'${a.char}' at position ${a.position + 1} might be ${a.suggestions.join("/")}`)
        .join("; ");
      recommendations.push({
        field: "idNumber",
        priority: "medium",
        message: `Possible OCR misread in ID number: ${suggestions}. Verify the number carefully against the document.`,
      });
    }
  }

  if (guest.dateOfBirth) {
    const dateStr = guest.dateOfBirth;
    const parsed = new Date(dateStr);

    if (!isNaN(parsed.getTime())) {
      const now = new Date();
      const age = now.getFullYear() - parsed.getFullYear();
      if (age > 100) {
        recommendations.push({
          field: "dateOfBirth",
          priority: "high",
          message: `Age (${age}) from date of birth (${dateStr}) seems unusually high — verify date is not swapped with expiry date. Expected format: DD/MM/YYYY or YYYY-MM-DD.`,
        });
      } else if (age < 1) {
        recommendations.push({
          field: "dateOfBirth",
          priority: "high",
          message: `Date of birth (${dateStr}) indicates an infant (age < 1) — verify correctness, or check if date format is wrong (e.g., MM/DD swapped with DD/MM).`,
        });
      }
    } else {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split("/");
        const maybeDd = parseInt(parts[0] ?? "0", 10);
        const maybeMm = parseInt(parts[1] ?? "0", 10);
        if (maybeDd > 12 && maybeMm <= 12) {
          recommendations.push({
            field: "dateOfBirth",
            priority: "medium",
            message: `Date "${dateStr}" appears to be in DD/MM/YYYY format (day=${maybeDd}, month=${maybeMm}). Could be MM/DD/YYYY — verify against document.`,
          });
        } else if (maybeMm > 12 && maybeDd <= 12) {
          recommendations.push({
            field: "dateOfBirth",
            priority: "medium",
            message: `Date "${dateStr}" appears to be in MM/DD/YYYY format (month=${maybeMm} is invalid, day=${maybeDd}). Try DD/MM/YYYY format.`,
          });
        }
      } else {
        recommendations.push({
          field: "dateOfBirth",
          priority: "high",
          message: `Date of birth "${dateStr}" could not be parsed. Expected formats: YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY.`,
        });
      }
    }
  }

  if (guest.passportExpiryDate) {
    const days = getDaysUntilExpiry(guest.passportExpiryDate);
    if (days !== null && days >= 0 && days < 90) {
      recommendations.push({
        field: "passportExpiryDate",
        priority: "high",
        message: `Passport expires in ${days} day${days === 1 ? "" : "s"} — document may not be valid for stay duration.`,
      });
    } else if (days !== null && days < 0) {
      recommendations.push({
        field: "passportExpiryDate",
        priority: "high",
        message: `Passport expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago — document is no longer valid.`,
      });
    }
  }

  if (guest.nationality && guest.nationality.length === 2) {
    const iso3 = ISO3_FROM_ISO2[guest.nationality.toUpperCase()];
    recommendations.push({
      field: "nationality",
      priority: "low",
      message: `Nationality uses 2-letter code (${guest.nationality}) — consider converting to 3-letter ISO code (e.g., ${iso3 ?? "???"}) for clarity in forms.`,
    });
  }

  const crossField = getCrossFieldIssues(guest);
  for (const issue of crossField) {
    const field = issue.includes("passport")
      ? "passportNumber"
      : issue.includes("gender") || issue.includes("male") || issue.includes("female")
        ? "gender"
        : issue.includes("DOB") || issue.includes("date of birth") || issue.includes("d.o.b.")
          ? "dateOfBirth"
          : issue.includes("Nationality")
            ? "nationality"
            : "cross-field";
    const existing = recommendations.find((r) => r.message === issue);
    if (!existing) {
      recommendations.push({ field, priority: "high", message: issue });
    }
  }

  return recommendations;
}

export function getFieldQuickFixes(guest: GuestRow, fieldName: string): QuickFix[] {
  const fixes: QuickFix[] = [];
  const value = String((guest as Record<string, unknown>)[fieldName] ?? "");

  if (!value) return fixes;

  if (fieldName === "passportNumber" || fieldName === "idNumber") {
    const ambiguous = getCharacterAmbiguityWarnings(value);
    for (const warning of ambiguous) {
      for (const suggestion of warning.suggestions) {
        const original = warning.char;
        const replacement = suggestion;
        if (original !== replacement) {
          const fixed = value.substring(0, warning.position) + replacement + value.substring(warning.position + 1);
          fixes.push({
            label: `Replace '${original}' with '${replacement}'`,
            action: "replace",
            value: fixed,
            description: `Position ${warning.position + 1}: '${original}' → '${replacement}'`,
          });
        }
      }
    }

    if (/^0+$/.test(value)) {
      fixes.push({
        label: "Zero-filled value — check original document",
        action: "review",
        description: "This appears to be a placeholder, not a real document number",
      });
    }

    if (fieldName === "passportNumber" && guest.nationality) {
      const validation = validatePassportForCountry(value, guest.nationality);
      if (!validation.valid) {
        fixes.push({
          label: `Review format for ${guest.nationality}`,
          action: "review",
          description: validation.message ?? "Format does not match expected pattern",
        });
      }
    }
  }

  if (fieldName === "fullName" || fieldName === "surname" || fieldName === "givenName") {
    if (value.length < 3) {
      fixes.push({
        label: value.length < 2 ? "Check original document — name too short" : "Verify name — may be truncated",
        action: "review",
        description: `Name is only ${value.length} character${value.length === 1 ? "" : "s"} — check the scanned document`,
      });
    }

    const digitCount = (value.match(/\d/g) ?? []).length;
    if (digitCount > 0) {
      fixes.push({
        label: `Remove ${digitCount} digit${digitCount === 1 ? "" : "s"} from name`,
        action: "replace",
        value: value.replace(/\d/g, "").trim(),
        description: "Names should not contain digits — likely OCR error",
      });
    }
  }

  if (fieldName === "dateOfBirth") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      const now = new Date();
      const age = now.getFullYear() - parsed.getFullYear();
      if (age < 1 || age > 120) {
        fixes.push({
          label: "Verify date in original document",
          action: "review",
          description:
            age < 1
              ? "Date of birth indicates age < 1 — may be wrong"
              : `Age ${age} is outside expected range — may be swapped with expiry date`,
        });
      }
    } else {
      if (/^\d{8}$/.test(value)) {
        const y = value.slice(0, 4);
        const m = value.slice(4, 6);
        const d = value.slice(6, 8);
        fixes.push({
          label: `Try formatted: ${d}/${m}/${y}`,
          action: "replace",
          value: `${d}/${m}/${y}`,
          description: "Date appears to be in compact YYYYMMDD format",
        });
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const parts = value.split("/");
        fixes.push({
          label: `Try YYYY-MM-DD: ${parts[2]}-${parts[1]}-${parts[0]}`,
          action: "replace",
          value: `${parts[2]}-${parts[1]}-${parts[0]}`,
          description: "Date format may be DD/MM/YYYY — converting to YYYY-MM-DD",
        });
      }
    }
  }

  if (fieldName === "gender" && value !== "M" && value !== "F" && value !== "UNKNOWN") {
    if (value.toUpperCase() === "MALE") {
      fixes.push({ label: "Use 'M'", action: "replace", value: "M", description: "Convert 'Male' to 'M'" });
    } else if (value.toUpperCase() === "FEMALE") {
      fixes.push({ label: "Use 'F'", action: "replace", value: "F", description: "Convert 'Female' to 'F'" });
    }
  }

  if (fieldName === "nationality" && value.length === 2) {
    const iso3 = ISO3_FROM_ISO2[value.toUpperCase()];
    if (iso3) {
      fixes.push({
        label: `Convert to ISO3: ${iso3}`,
        action: "replace",
        value: iso3,
        description: `Replace 2-letter code ${value} with 3-letter code ${iso3}`,
      });
    }
  }

  return fixes.slice(0, 5);
}

export function getAggregateAccuracy(guest: GuestRow): AggregateAccuracy {
  const perField = getFieldAccuracyInfo(guest);
  const crossFieldIssues = getCrossFieldIssues(guest);
  const recommendations = getAccuracyRecommendations(guest);

  if (perField.length === 0) {
    return { overallScore: 0, overallLevel: "LOW", perField: [], recommendations };
  }

  const totalScore = perField.reduce((sum, f) => sum + f.score, 0);
  const avgScore = totalScore / perField.length;

  const crossFieldPenalty = crossFieldIssues.length * 0.1;
  const overallScore = Math.max(0, Math.min(1, avgScore - crossFieldPenalty));

  const overallLevel: ConfidenceLevel = overallScore >= 0.9 ? "HIGH" : overallScore >= 0.7 ? "MEDIUM" : "LOW";

  return { overallScore, overallLevel, perField, recommendations };
}

export function applyTransformsWithValidation(
  value: string,
  rules: TransformRule[],
): { result: string; valid: boolean; brokenStep?: number; error?: string } {
  let current = value;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) break;
    const next = applyTransforms(current, [rule]);
    if (next === "" && current !== "") {
      return {
        result: current,
        valid: false,
        brokenStep: i,
        error: `Transform at step ${i + 1} (${rule.type}) produced empty result`,
      };
    }
    current = next;
  }
  return { result: current, valid: true };
}

export type SafetyCheckResult = {
  passed: boolean;
  checks: SafetyCheck[];
};

export type SafetyCheck = {
  name: string;
  passed: boolean;
  message?: string;
};

export type AccuracyInfo = {
  field: string;
  level: ConfidenceLevel;
  score: number;
  issues: string[];
};

export function checkGuestRow(guest: GuestRow, requireConfirmation?: boolean): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const rowExists = !!guest.id;
  checks.push({ name: "guest_row_exists", passed: rowExists, message: rowExists ? undefined : "Guest row not found" });

  const notFailed = !!(guest.status !== "FAILED" || requireConfirmation);
  checks.push({
    name: "guest_not_failed",
    passed: notFailed,
    message: notFailed ? undefined : "Guest row has FAILED status",
  });

  const hasRequiredFields = checkRequiredFields(guest);
  checks.push({
    name: "required_fields_exist",
    passed: hasRequiredFields,
    message: hasRequiredFields ? undefined : "Required fields are missing",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkConfidence(guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const score = guest.confidenceScore ?? 0;
  const level = guest.confidenceLevel ?? "LOW";

  const highConfidence = score >= 0.9;
  checks.push({
    name: "high_confidence",
    passed: highConfidence,
    message: highConfidence
      ? undefined
      : `Low confidence score: ${level} (${(score * 100).toFixed(0)}%) — review guest data before filling`,
  });

  const mediumConfidence = score >= 0.7;
  checks.push({
    name: "medium_confidence",
    passed: mediumConfidence,
    message: mediumConfidence
      ? undefined
      : `Very low confidence score: ${level} (${(score * 100).toFixed(0)}%) — data may be inaccurate`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkFieldAccuracy(guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  if (guest.fullName) {
    const digitRatio = (guest.fullName.match(/\d/g) ?? []).length / guest.fullName.length;
    if (guest.fullName.length < 2) {
      checks.push({ name: "field_fullName_length", passed: false, message: "Full name is too short" });
    }
    if (/^\d+$/.test(guest.fullName)) {
      checks.push({ name: "field_fullName_digits", passed: false, message: "Full name contains only digits" });
    }
    if (digitRatio > 0.5) {
      checks.push({
        name: "field_fullName_digitRatio",
        passed: false,
        message: "Full name contains >50% digits — likely OCR error",
      });
    }
  }

  if (guest.passportNumber) {
    const validPassport = /^[A-Za-z0-9]{5,20}$/.test(guest.passportNumber);
    checks.push({
      name: "field_passportNumber_format",
      passed: validPassport,
      message: validPassport ? undefined : "Passport number format is invalid",
    });
    if (/^0+$/.test(guest.passportNumber)) {
      checks.push({
        name: "field_passportNumber_zeros",
        passed: false,
        message: "Passport number appears to be default/zero-filled",
      });
    }
    if (guest.nationality) {
      const validation = validatePassportForCountry(guest.passportNumber, guest.nationality);
      if (!validation.valid) {
        checks.push({
          name: "field_passportNumber_countryPattern",
          passed: false,
          message: validation.message ?? "Passport does not match country-specific pattern",
        });
      }
    }
  }

  if (guest.idNumber) {
    const validId = /^[A-Za-z0-9]{5,30}$/.test(guest.idNumber);
    checks.push({
      name: "field_idNumber_format",
      passed: validId,
      message: validId ? undefined : "ID number format is invalid",
    });
  }

  if (guest.dateOfBirth) {
    const parsed = new Date(guest.dateOfBirth);
    const validDate = !isNaN(parsed.getTime());
    checks.push({
      name: "field_dateOfBirth_parse",
      passed: validDate,
      message: validDate ? undefined : "Date of birth is not a valid date",
    });
    if (validDate) {
      const now = new Date();
      const age = now.getFullYear() - parsed.getFullYear();
      const reasonable = age > 0 && age < 120;
      checks.push({
        name: "field_dateOfBirth_range",
        passed: reasonable,
        message: reasonable ? undefined : "Date of birth is outside reasonable range (0–120 years)",
      });
      if (parsed > now) {
        checks.push({ name: "field_dateOfBirth_future", passed: false, message: "Date of birth is in the future" });
      }
    }
  }

  if (guest.passportExpiryDate) {
    const parsed = new Date(guest.passportExpiryDate);
    if (!isNaN(parsed.getTime()) && parsed < new Date()) {
      checks.push({ name: "field_passportExpiryDate_expired", passed: false, message: "Passport has expired" });
    }
  }

  if (guest.idExpiryDate) {
    const parsed = new Date(guest.idExpiryDate);
    if (!isNaN(parsed.getTime()) && parsed < new Date()) {
      checks.push({ name: "field_idExpiryDate_expired", passed: false, message: "ID has expired" });
    }
  }

  if (guest.gender && guest.gender !== "UNKNOWN") {
    const validGender = guest.gender === "M" || guest.gender === "F";
    checks.push({
      name: "field_gender_value",
      passed: validGender,
      message: validGender ? undefined : `Unusual gender value: ${guest.gender}`,
    });
  }

  if (guest.nationality && guest.issuingCountry && guest.nationality !== guest.issuingCountry) {
    const normNationality = ISO3_FROM_ISO2[guest.nationality] ?? guest.nationality;
    const normIssuing = ISO3_FROM_ISO2[guest.issuingCountry] ?? guest.issuingCountry;
    if (normNationality !== normIssuing) {
      checks.push({
        name: "field_nationality_consistency",
        passed: false,
        message: `Nationality (${guest.nationality}) differs from issuing country (${guest.issuingCountry})`,
      });
    }
  }

  if (guest.gender && guest.gender !== "UNKNOWN" && guest.fullName) {
    const guessed = guessNameGender(guest.fullName);
    if (guessed !== "ambiguous" && guessed !== guest.gender) {
      checks.push({
        name: "field_gender_name_consistency",
        passed: false,
        message: `Name suggests ${guessed === "M" ? "male" : "female"} but gender is ${guest.gender === "M" ? "M" : "F"}`,
      });
    }
  }

  if (guest.dateOfBirth && guest.passportExpiryDate) {
    const dob = new Date(guest.dateOfBirth);
    const exp = new Date(guest.passportExpiryDate);
    if (!isNaN(dob.getTime()) && !isNaN(exp.getTime()) && exp <= dob) {
      checks.push({
        name: "field_expiry_vs_dob",
        passed: false,
        message: "Passport expiry date is before or same as date of birth — values may be swapped",
      });
    }
  }

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkTemplateMatch(
  template: TargetSystemTemplate,
  currentUrl?: string,
  currentWindowTitle?: string,
): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const templateExists = !!template.id;
  checks.push({
    name: "template_exists",
    passed: templateExists,
    message: templateExists ? undefined : "Target template not found",
  });

  if (template.urlPattern && currentUrl) {
    const patternMatch = matchPattern(template.urlPattern, currentUrl);
    checks.push({
      name: "url_matches",
      passed: patternMatch,
      message: patternMatch ? undefined : `URL does not match pattern: ${template.urlPattern}`,
    });
  } else if (template.urlPattern) {
    checks.push({ name: "url_matches", passed: false, message: "Current URL not available for matching" });
  } else {
    checks.push({ name: "url_matches", passed: true });
  }

  if (template.windowTitlePattern && currentWindowTitle) {
    const titleMatch = currentWindowTitle.includes(template.windowTitlePattern.replace("*", ""));
    checks.push({
      name: "window_title_matches",
      passed: titleMatch,
      message: titleMatch ? undefined : `Window title does not match: ${template.windowTitlePattern}`,
    });
  } else if (template.windowTitlePattern) {
    checks.push({ name: "window_title_matches", passed: false, message: "Window title not available for matching" });
  } else {
    checks.push({ name: "window_title_matches", passed: true });
  }

  const hasFields = template.mappings.some((m) => m.enabled);
  checks.push({
    name: "has_mapped_fields",
    passed: hasFields,
    message: hasFields ? undefined : "No mapped fields in template",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkAutoSaveSafety(template: TargetSystemTemplate, guest: GuestRow): SafetyCheckResult {
  const checks: SafetyCheck[] = [];

  const saveModeIsAuto = template.saveMode === "auto";
  checks.push({
    name: "auto_save_enabled",
    passed: saveModeIsAuto,
    message: saveModeIsAuto ? undefined : "Auto Save is not enabled for this template",
  });

  const hasAutoSaveSelector = !!template.autoSaveSelector || !!template.autoSaveControlId;
  checks.push({
    name: "auto_save_configured",
    passed: hasAutoSaveSelector,
    message: hasAutoSaveSelector ? undefined : "Auto Save selector is not configured",
  });

  const allRequiredMapped = template.mappings
    .filter((m) => m.enabled && m.required)
    .every((m) => {
      const val = (guest as Record<string, unknown>)[m.excelColumn];
      return val !== undefined && val !== null && val !== "";
    });
  checks.push({
    name: "required_values_exist",
    passed: allRequiredMapped,
    message: allRequiredMapped ? undefined : "Required guest values are missing",
  });

  const guestNotFailed = guest.status !== "FAILED";
  checks.push({
    name: "guest_not_failed",
    passed: guestNotFailed,
    message: guestNotFailed ? undefined : "Guest has FAILED status",
  });

  return { passed: checks.every((c) => c.passed), checks };
}

export function checkMappedValuesExist(guest: GuestRow, template: TargetSystemTemplate): SafetyCheckResult {
  const checks: SafetyCheck[] = [];
  for (const mapping of template.mappings.filter((m) => m.enabled)) {
    const value = (guest as Record<string, unknown>)[mapping.excelColumn];
    const exists = value !== undefined && value !== null && value !== "";
    checks.push({
      name: `field_${mapping.excelColumn}`,
      passed: exists,
      message: exists ? undefined : `Required value missing: ${mapping.targetFieldName}`,
    });
  }
  return { passed: checks.every((c) => c.passed), checks };
}

function checkRequiredFields(guest: GuestRow): boolean {
  if (!guest.fullName) return false;
  if (guest.documentType === "PASSPORT" && !guest.passportNumber) return false;
  if (guest.documentType === "ID_CARD" && !guest.idNumber) return false;
  return true;
}

export function getFieldAccuracyInfo(guest: GuestRow): AccuracyInfo[] {
  const accuracies: AccuracyInfo[] = [];

  if (guest.fullName) {
    accuracies.push(applyFieldConfidence(guest, "fullName", getNameAccuracy(guest.fullName, "fullName")));
  }
  if (guest.surname) {
    accuracies.push(applyFieldConfidence(guest, "surname", getNameAccuracy(guest.surname, "surname")));
  }
  if (guest.givenName) {
    accuracies.push(applyFieldConfidence(guest, "givenName", getNameAccuracy(guest.givenName, "givenName")));
  }
  if (guest.passportNumber) {
    accuracies.push(
      applyFieldConfidence(guest, "passportNumber", getPassportAccuracy(guest.passportNumber, guest.nationality)),
    );
  }
  if (guest.idNumber) {
    accuracies.push(applyFieldConfidence(guest, "idNumber", getIdAccuracy(guest.idNumber)));
  }
  if (guest.dateOfBirth) {
    accuracies.push(applyFieldConfidence(guest, "dateOfBirth", getDateAccuracy("dateOfBirth", guest.dateOfBirth)));
  }
  if (guest.passportExpiryDate) {
    accuracies.push(
      applyFieldConfidence(
        guest,
        "passportExpiryDate",
        getDateAccuracy("passportExpiryDate", guest.passportExpiryDate),
      ),
    );
  }
  if (guest.idExpiryDate) {
    accuracies.push(applyFieldConfidence(guest, "idExpiryDate", getDateAccuracy("idExpiryDate", guest.idExpiryDate)));
  }
  if (guest.gender) {
    accuracies.push(applyFieldConfidence(guest, "gender", getGenderAccuracy(guest.gender)));
  }
  if (guest.nationality) {
    accuracies.push(applyFieldConfidence(guest, "nationality", getNationalityAccuracy(guest.nationality)));
  }
  if (guest.issuingCountry) {
    accuracies.push(applyFieldConfidence(guest, "issuingCountry", getNationalityAccuracy(guest.issuingCountry)));
  }

  return accuracies;
}

function applyFieldConfidence(guest: GuestRow, fieldName: string, accuracy: AccuracyInfo): AccuracyInfo {
  const ocrConfidence = guest.fieldConfidence?.[fieldName];
  if (ocrConfidence === undefined) {
    const overallOcr = guest.confidenceScore;
    if (overallOcr !== undefined && overallOcr < 0.9) {
      const blended = accuracy.score * 0.7 + overallOcr * 0.3;
      const score = Math.max(0, Math.min(1, blended));
      const issues =
        overallOcr < 0.7
          ? [...accuracy.issues, `Low overall OCR confidence (${(overallOcr * 100).toFixed(0)}%)`]
          : accuracy.issues;
      return { ...accuracy, score, level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW", issues };
    }
    return accuracy;
  }

  const ocrWeight = ocrConfidence >= 0.9 ? 0.3 : ocrConfidence >= 0.7 ? 0.4 : 0.5;
  const blended = accuracy.score * (1 - ocrWeight) + ocrConfidence * ocrWeight;
  const score = Math.max(0, Math.min(1, blended));

  const issues = [...accuracy.issues];
  if (ocrConfidence < 0.9) {
    issues.push(`OCR confidence: ${(ocrConfidence * 100).toFixed(0)}%`);
  }
  if (ocrConfidence < 0.7) {
    issues.push(`Low OCR confidence for this field — verify against document`);
  }

  return {
    ...accuracy,
    score,
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    issues,
  };
}

function getNameAccuracy(name: string, fieldName: string = "fullName"): AccuracyInfo {
  const issues: string[] = [];
  let score = 1.0;

  const digitRatio = (name.match(/\d/g) ?? []).length / name.length;
  if (digitRatio > 0.5) {
    score = Math.min(score, 0.4);
    issues.push("Name contains mostly digits — likely OCR error");
  } else if (digitRatio > 0.25) {
    score = Math.min(score, 0.7);
    issues.push("Name has unusual digit content");
  }

  if (name.length < 2) {
    score = Math.min(score, 0.3);
    issues.push("Name too short");
  } else if (name.length < 3) {
    score = Math.min(score, 0.6);
    issues.push("Name is very short — check for truncation");
  }

  if (name.length >= 3 && !name.includes(" ") && !name.includes("-") && !name.includes(".")) {
    const hasUpper = /[A-ZÀ-Ỹ]/.test(name);
    const ratio = name.replace(/[a-zà-ỹ]/g, "").length / name.length;
    if (hasUpper && ratio > 0.7) {
      score = Math.min(score, 0.8);
      issues.push("Name may be missing given name (surname only?)");
    }
  }

  if (/^\d+$/.test(name)) {
    score = Math.min(score, 0.1);
    issues.push("Name contains only digits");
  }

  const specialCharRatio = (name.match(/[^a-zA-Z0-9\s\-'.À-Ỹà-ỹ]/g) ?? []).length / name.length;
  if (specialCharRatio > 0.3) {
    score = Math.min(score, 0.5);
    issues.push("Name has unusual special characters");
  }

  return {
    field: fieldName,
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getPassportAccuracy(passport: string, nationality?: string): AccuracyInfo {
  const issues: string[] = [];
  let score = 1.0;

  const ambiguous = getCharacterAmbiguityWarnings(passport);
  if (ambiguous.length > 0) {
    score -= Math.min(0.2, ambiguous.length * 0.05);
    const chars = [...new Set(ambiguous.map((a) => `'${a.char}'`))].join(", ");
    issues.push(`Possible OCR misread at chars: ${chars}`);
  }

  if (!/^[A-Za-z0-9]{5,20}$/.test(passport)) {
    score = Math.min(score, 0.3);
    issues.push("Invalid passport format (expected 5-20 alphanumeric characters)");
  }

  if (/^0+$/.test(passport)) {
    score = Math.min(score, 0.1);
    issues.push("Zero-filled passport number");
  }

  if (nationality) {
    const validation = validatePassportForCountry(passport, nationality);
    if (!validation.valid) {
      score = Math.min(score, 0.4);
      if (validation.message) issues.push(validation.message);
    }
  }

  return {
    field: "passportNumber",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getIdAccuracy(id: string): AccuracyInfo {
  const issues: string[] = [];
  let score = 1.0;

  const ambiguous = getCharacterAmbiguityWarnings(id);
  if (ambiguous.length > 0) {
    score -= Math.min(0.15, ambiguous.length * 0.03);
    const chars = [...new Set(ambiguous.map((a) => `'${a.char}'`))].join(", ");
    issues.push(`Possible OCR misread at chars: ${chars}`);
  }

  if (!/^[A-Za-z0-9]{5,30}$/.test(id)) {
    score = Math.min(score, 0.3);
    issues.push("Invalid ID number format (expected 5-30 alphanumeric characters)");
  }

  return {
    field: "idNumber",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getDateAccuracy(field: string, date: string): AccuracyInfo {
  const issues: string[] = [];
  const parsed = new Date(date);
  let score = 1.0;

  if (isNaN(parsed.getTime())) {
    score = 0.2;
    issues.push("Invalid date format");

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      const parts = date.split("/");
      const d = parseInt(parts[0] ?? "0", 10);
      const m = parseInt(parts[1] ?? "0", 10);
      const y = parseInt(parts[2] ?? "0", 10);
      if (d > 0 && d <= 31 && m > 0 && m <= 12 && y > 1900 && y < 2100) {
        score = 0.5;
        issues.push("Date format may be ambiguous — try DD/MM/YYYY or MM/DD/YYYY");
      }
    }
  } else {
    const now = new Date();
    if (field === "passportExpiryDate" || field === "idExpiryDate") {
      if (parsed < now) {
        const daysExpired = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
        score = 0.3;
        issues.push(`Document expired ${daysExpired} day${daysExpired === 1 ? "" : "s"} ago`);
      } else {
        const daysRemaining = Math.ceil((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 90) {
          score = Math.min(score, 0.7);
          issues.push(`Document expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} — near expiry`);
        }
      }
    }
    if (field === "dateOfBirth") {
      const age = now.getFullYear() - parsed.getFullYear();
      if (age <= 0 || age >= 120) {
        score = 0.2;
        issues.push("Age outside reasonable range (1–119 years)");
      } else if (age < 5) {
        score = Math.min(score, 0.7);
        issues.push(`Age (${age}) is very young — verify date is correct`);
      } else if (age > 90) {
        score = Math.min(score, 0.8);
      }
    }
  }

  return {
    field,
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getGenderAccuracy(gender: string): AccuracyInfo {
  const score = gender === "M" || gender === "F" ? 1.0 : gender === "UNKNOWN" ? 0.0 : 0.5;
  const issues: string[] = [];
  if (score < 1.0) issues.push(`Unusual gender value: ${gender}`);
  return {
    field: "gender",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function getNationalityAccuracy(nationality: string): AccuracyInfo {
  const issues: string[] = [];
  const validIso2 = /^[A-Za-z]{2}$/.test(nationality);
  const validIso3 = /^[A-Za-z]{3}$/.test(nationality);
  let score = 1.0;
  if (!validIso2 && !validIso3) {
    score = 0.4;
    issues.push("Unexpected nationality format (expected 2 or 3 letter code)");
  } else if (validIso2) {
    const knownIso2 =
      /^(VN|US|KR|CN|JP|FR|DE|GB|IT|ES|CA|AU|BR|IN|RU|MX|ID|NL|SA|CH|SE|NO|DK|FI|BE|AT|PT|GR|IE|NZ|SG|MY|TH|PH|HK|TW|AR|CL|CO|ZA|EG|NG|KE|TR|PL|CZ|HU|RO|UA|IL|AE|PK|BD|KZ|UZ|QA|KW|OM|IR|MM|LA|KH|MO|MN|NP|LK)$/i;
    const validCode = knownIso2.test(nationality);
    if (!validCode) {
      score = 0.7;
      issues.push(`Unrecognized 2-letter country code: ${nationality}`);
    }
  }
  return {
    field: "nationality",
    level: score >= 0.9 ? "HIGH" : score >= 0.7 ? "MEDIUM" : "LOW",
    score,
    issues,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function matchPattern(pattern: string, url: string): boolean {
  if (pattern.includes("*")) {
    const parts = pattern.split("*");
    const escaped = parts.map((p) => escapeRegex(p));
    const regexStr = escaped.join(".*");
    const regex = new RegExp(regexStr);
    return regex.test(url);
  }
  return url.includes(pattern);
}
