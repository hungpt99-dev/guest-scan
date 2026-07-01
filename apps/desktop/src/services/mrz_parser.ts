import { logger } from "../lib/logger";

export type MrzFormat = "TD1" | "TD2" | "TD3" | "UNKNOWN";

export type MrzFieldResult = {
  value: string;
  raw: string;
  corrected: boolean;
  valid: boolean;
};

export type MrzCorrection = {
  field: string;
  from: string;
  to: string;
  reason: string;
};

export type MrzParseResult = {
  format: MrzFormat;
  documentType: MrzFieldResult;
  issuingCountry: MrzFieldResult;
  surname: MrzFieldResult;
  givenName: MrzFieldResult;
  fullName: MrzFieldResult;
  passportNumber: MrzFieldResult;
  nationality: MrzFieldResult;
  dateOfBirth: MrzFieldResult;
  gender: MrzFieldResult;
  expiryDate: MrzFieldResult;
  optionalData: MrzFieldResult;
  checkDigits: Record<string, boolean>;
  overallValid: boolean;
  corrections: MrzCorrection[];
  mrzLines: string[];
};

export type MrzParserOptions = {
  correctOcrErrors?: boolean;
  validateChecksums?: boolean;
  centuryBreak?: number;
};

const WEIGHTS = [7, 3, 1];
const DEFAULT_OPTIONS: Required<MrzParserOptions> = {
  correctOcrErrors: true,
  validateChecksums: true,
  centuryBreak: 49,
};

function charValue(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  if (ch === "<") return 0;
  return 0;
}

export function computeCheckDigit(value: string): string {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] ?? "";
    total += charValue(ch) * WEIGHTS[i % 3]!;
  }
  return String(total % 10);
}

function hasAmbiguousChars(value: string): boolean {
  return /[O0I1]/.test(value);
}

const ALPHA_AMBIGUOUS_MAP: Record<string, string[]> = {
  O: ["0"],
  "0": ["O"],
  I: ["1"],
  "1": ["I"],
};

const DATE_AMBIGUOUS_MAP: Record<string, string[]> = {
  O: ["0"],
  "0": ["O"],
  I: ["1"],
  "1": ["I"],
  L: ["1"],
  Z: ["2"],
  S: ["5"],
  B: ["8"],
  G: ["6"],
};

const COUNTRY_REPAIRS: Record<string, string> = {
  VNB: "VNM",
};

function getAmbiguousMapForField(fieldType: string): Record<string, string[]> {
  if (fieldType === "date" || fieldType === "expiry") {
    return DATE_AMBIGUOUS_MAP;
  }
  return ALPHA_AMBIGUOUS_MAP;
}

function getAmbiguousPositions(value: string, fieldType: string): number[] {
  const positions: number[] = [];
  const map = getAmbiguousMapForField(fieldType);
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch && map[ch]) {
      positions.push(i);
    }
  }
  return positions;
}

function* generateAllSubstitutions(
  value: string,
  positions: number[],
  map: Record<string, string[]>,
): Generator<string> {
  if (positions.length === 0) {
    yield value;
    return;
  }

  const firstPos = positions[0]!;
  const ch = value[firstPos];
  const remainingPositions = positions.slice(1);

  yield* generateAllSubstitutions(value, remainingPositions, map);

  if (!ch) return;
  const replacements = map[ch];
  if (!replacements || replacements.length === 0) return;

  for (const replacement of replacements) {
    const mutated = value.slice(0, firstPos) + replacement + value.slice(firstPos + 1);
    yield* generateAllSubstitutions(mutated, remainingPositions, map);
  }
}

export function generateRepairCandidates(rawValue: string, fieldType: string): string[] {
  const candidates: string[] = [];
  const map = getAmbiguousMapForField(fieldType);
  const positions = getAmbiguousPositions(rawValue, fieldType);

  if (positions.length === 0) {
    if (fieldType === "country" && COUNTRY_REPAIRS[rawValue]) {
      candidates.push(COUNTRY_REPAIRS[rawValue]!);
    }
    return candidates;
  }

  for (const mutated of generateAllSubstitutions(rawValue, positions, map)) {
    if (mutated !== rawValue) {
      candidates.push(mutated);
    }
  }

  if (fieldType === "country") {
    const countryRepair = COUNTRY_REPAIRS[rawValue];
    if (countryRepair && !candidates.includes(countryRepair)) {
      candidates.push(countryRepair);
    }
    for (const mutated of [...candidates]) {
      const cr = COUNTRY_REPAIRS[mutated];
      if (cr && !candidates.includes(cr)) {
        candidates.push(cr);
      }
    }
  }

  const unique = [...new Set(candidates)];
  unique.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return unique;
}

export function selectBestCandidate(
  rawValue: string,
  candidates: string[],
  expectedCheckDigit: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  if (!expectedCheckDigit || expectedCheckDigit === "<") {
    return { value: rawValue, corrected: false };
  }

  const originalDigit = computeCheckDigit(rawValue);
  if (originalDigit === expectedCheckDigit) {
    return { value: rawValue, corrected: false };
  }

  if (candidates.length === 0) {
    return { value: rawValue, corrected: false };
  }

  const matchingCandidate = candidates.find((c) => computeCheckDigit(c) === expectedCheckDigit);

  if (matchingCandidate) {
    return {
      value: matchingCandidate,
      corrected: true,
      correction: { field: fieldName, from: rawValue, to: matchingCandidate, reason: "checksum_fix" },
    };
  }

  return { value: rawValue, corrected: false };
}

function repairDateField(
  rawValue: string,
  expectedCheckDigit: string,
  fieldName: string,
  centuryBreak: number,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  const originalParsed = parseMrzDate(rawValue, centuryBreak);
  if (originalParsed) {
    const digit = computeCheckDigit(rawValue);
    if (digit === expectedCheckDigit || !expectedCheckDigit || expectedCheckDigit === "<") {
      return { value: originalParsed, corrected: false };
    }
  }

  if (expectedCheckDigit && expectedCheckDigit !== "<" && expectedCheckDigit !== "") {
    const candidates = generateRepairCandidates(rawValue, "date");
    for (const candidate of candidates) {
      const candidateDigit = computeCheckDigit(candidate);
      if (candidateDigit === expectedCheckDigit) {
        const parsed = parseMrzDate(candidate, centuryBreak);
        if (parsed) {
          return {
            value: parsed,
            corrected: true,
            correction: { field: fieldName, from: rawValue, to: candidate, reason: "checksum_fix" },
          };
        }
      }
    }
  }

  const repaired = applyDateRepairsDirect(rawValue, fieldName);
  if (repaired.corrected && repaired.correction) {
    const parsed = parseMrzDate(repaired.value, centuryBreak);
    if (parsed) {
      return { value: parsed, corrected: true, correction: repaired.correction };
    }
  }

  if (originalParsed) {
    return { value: originalParsed, corrected: false };
  }
  return { value: "", corrected: false };
}

function applyDateRepairsDirect(
  rawValue: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let value = rawValue;
  const replacements: Array<{ from: RegExp; to: string }> = [];
  if (/S/.test(value)) replacements.push({ from: /S/g, to: "5" });
  if (/B/.test(value)) replacements.push({ from: /B/g, to: "8" });
  if (/G/.test(value)) replacements.push({ from: /G/g, to: "6" });

  for (const r of replacements) {
    value = value.replace(r.from, r.to);
  }

  if (value !== rawValue) {
    return { value, corrected: true, correction: { field: fieldName, from: rawValue, to: value, reason: "ocr_fix" } };
  }
  return { value: rawValue, corrected: false };
}

function applyNameRepairs(
  rawValue: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let value = rawValue;
  const replacements: Array<{ from: RegExp; to: string }> = [];

  if (/0/.test(value) && /O/.test(value)) {
    replacements.push({ from: /0/g, to: "O" });
  } else if (/0/.test(value)) {
    replacements.push({ from: /0/g, to: "O" });
  }

  if (/1/.test(value) && /I/.test(value)) {
    replacements.push({ from: /1/g, to: "I" });
  } else if (/1/.test(value)) {
    replacements.push({ from: /1/g, to: "I" });
  }

  for (const r of replacements) {
    value = value.replace(r.from, r.to);
  }

  if (value !== rawValue) {
    return { value, corrected: true, correction: { field: fieldName, from: rawValue, to: value, reason: "ocr_fix" } };
  }
  return { value: rawValue, corrected: false };
}

function applyCountryRepairs(
  rawValue: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let value = rawValue;
  let corrected = false;
  const candidates = generateRepairCandidates(rawValue, "country");

  for (const candidate of candidates) {
    if (candidate.length === 3 && /^[A-Z]{3}$/.test(candidate)) {
      value = candidate;
      corrected = true;
      break;
    }
  }

  if (corrected && value !== rawValue) {
    return { value, corrected: true, correction: { field: fieldName, from: rawValue, to: value, reason: "ocr_fix" } };
  }
  return { value: rawValue, corrected: false };
}

export function detectMrzFormat(lines: string[]): MrzFormat {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length < 2) return "UNKNOWN";

  const l1 = cleaned[0]!.length;
  const l2 = cleaned[1]!.length;

  if (l1 >= 44 && l2 >= 44) return "TD3";
  if (l1 >= 36 && l2 >= 36) return "TD2";
  if (l1 >= 30 && l2 >= 30) return "TD1";

  return "UNKNOWN";
}

function parseNameField(raw: string): { surname: string; givenName: string; fullName: string } {
  const parts = raw.split("<<");
  const surname = (parts[0] || "").replace(/</g, " ").trim();
  const givenRaw = parts.slice(1).join("<");
  const givenName = givenRaw.replace(/</g, " ").trim();
  const fullName = [surname, givenName].filter(Boolean).join(" ");
  return { surname, givenName, fullName };
}

function parseMrzDate(raw: string, centuryBreak: number): string {
  if (!raw || raw.replace(/</g, "").length < 6) return "";
  const clean = raw.replace(/</g, "0");
  if (clean.length !== 6) return "";

  const yearTwo = parseInt(clean.slice(0, 2), 10);
  const month = parseInt(clean.slice(2, 4), 10);
  const day = parseInt(clean.slice(4, 6), 10);

  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) return "";

  const fullYear = yearTwo <= centuryBreak ? 2000 + yearTwo : 1900 + yearTwo;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function createFieldResult(value: string, raw: string, valid: boolean, corrected: boolean): MrzFieldResult {
  return { value, raw, corrected, valid };
}

function emptyResult(lines: string[]): MrzParseResult {
  return {
    format: "UNKNOWN",
    documentType: createFieldResult("", "", false, false),
    issuingCountry: createFieldResult("", "", false, false),
    surname: createFieldResult("", "", false, false),
    givenName: createFieldResult("", "", false, false),
    fullName: createFieldResult("", "", false, false),
    passportNumber: createFieldResult("", "", false, false),
    nationality: createFieldResult("", "", false, false),
    dateOfBirth: createFieldResult("", "", false, false),
    gender: createFieldResult("", "", false, false),
    expiryDate: createFieldResult("", "", false, false),
    optionalData: createFieldResult("", "", false, false),
    checkDigits: {},
    overallValid: false,
    corrections: [],
    mrzLines: lines,
  };
}

function parseTd3(line1: string, line2: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2]);
  result.format = "TD3";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  let issuingCorrected = false;
  if (options.correctOcrErrors && issuingRaw.length > 0) {
    const nameCorrected = applyNameRepairs(issuingRaw, "issuingCountry");
    if (nameCorrected.corrected && nameCorrected.correction) {
      issuingRaw = nameCorrected.value;
      issuingCorrected = true;
      result.corrections.push(nameCorrected.correction);
    }
    const countryCorrected = applyCountryRepairs(issuingRaw, "issuingCountry");
    if (countryCorrected.corrected && countryCorrected.correction) {
      issuingRaw = countryCorrected.value;
      issuingCorrected = true;
      if (!result.corrections.find((c) => c.field === "issuingCountry" && c.to === issuingRaw)) {
        result.corrections.push(countryCorrected.correction);
      }
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, issuingCorrected);

  let nameRaw = line1.length >= 44 ? line1.slice(5, 44) : line1.slice(5);
  const nameCorrected = applyNameRepairs(nameRaw, "name");
  if (nameCorrected.corrected && nameCorrected.correction) {
    nameRaw = nameCorrected.value;
    result.corrections.push(nameCorrected.correction);
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNumRaw = line2.slice(0, 9);
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNumRaw.replace(/</g, ""),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    passResult = selectBestCandidate(passNumRaw, candidates, passCd, "passportNumber");
    if (!passResult.corrected && passCd !== "<" && passCd !== "") {
      const dateCandidates = generateRepairCandidates(passNumRaw, "date");
      passResult = selectBestCandidate(passNumRaw, dateCandidates, passCd, "passportNumber");
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(passNumRaw)) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    if (candidates.length > 0) {
      passResult = {
        value: candidates[0]!.replace(/</g, ""),
        corrected: true,
        correction: { field: "passportNumber", from: passNumRaw, to: candidates[0]!, reason: "ocr_fix" },
      };
    }
  }

  if (passResult.correction) {
    const existing = result.corrections.find((c) => c.field === "passportNumber");
    if (!existing) {
      result.corrections.push(passResult.correction);
    }
  }

  const finalPassValue = passResult.value.replace(/</g, "");
  result.passportNumber = createFieldResult(
    finalPassValue,
    passNumRaw.replace(/</g, ""),
    finalPassValue.length > 0,
    passResult.corrected,
  );

  let natRaw = line2.slice(10, 13) || "";
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  let natCorrected = false;
  if (options.correctOcrErrors && natRaw.length > 0) {
    const nameFix = applyNameRepairs(natRaw, "nationality");
    if (nameFix.corrected && nameFix.correction) {
      natRaw = nameFix.value;
      natCorrected = true;
      result.corrections.push(nameFix.correction);
    }
    const countryFix = applyCountryRepairs(natRaw, "nationality");
    if (countryFix.corrected && countryFix.correction) {
      natRaw = countryFix.value;
      natCorrected = true;
      if (!result.corrections.find((c) => c.field === "nationality" && c.to === natRaw)) {
        result.corrections.push(countryFix.correction);
      }
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, natCorrected);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  const dobRepair = options.correctOcrErrors
    ? repairDateField(dobRaw, dobCd, "dateOfBirth", options.centuryBreak)
    : { value: parseMrzDate(dobRaw, options.centuryBreak), corrected: false };
  result.dateOfBirth = createFieldResult(dobRepair.value, dobRaw, dobRepair.value.length > 0, dobRepair.corrected);

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  const expiryRepair = options.correctOcrErrors
    ? repairDateField(expiryRaw, expiryCd, "expiryDate", options.centuryBreak)
    : { value: parseMrzDate(expiryRaw, options.centuryBreak), corrected: false };
  result.expiryDate = createFieldResult(
    expiryRepair.value,
    expiryRaw,
    expiryRepair.value.length > 0,
    expiryRepair.corrected,
  );

  const optRaw = line2.slice(28, 42);
  const optValue = optRaw.replace(/</g, "").trim();
  result.optionalData = createFieldResult(optValue, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(passNumRaw) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobRepair.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryRepair.corrected;
    const optCd = line2[42] || "";
    const optCdValid = computeCheckDigit(optRaw) === optCd || optCd === "<" || optCd === "";
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
    const compositeCd = line2[43] || "";
    const compositeCdValid =
      computeCheckDigit(compositeInput) === compositeCd || compositeCd === "<" || compositeCd === "";

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: optCdValid,
      final_composite_valid: compositeCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid && compositeCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid && compositeCdValid;
  }

  return result;
}

function parseTd2(line1: string, line2: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2]);
  result.format = "TD2";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  let issuingCorrected = false;
  if (options.correctOcrErrors && issuingRaw.length > 0) {
    const nameCorrected = applyNameRepairs(issuingRaw, "issuingCountry");
    if (nameCorrected.corrected && nameCorrected.correction) {
      issuingRaw = nameCorrected.value;
      issuingCorrected = true;
      result.corrections.push(nameCorrected.correction);
    }
    const countryCorrected = applyCountryRepairs(issuingRaw, "issuingCountry");
    if (countryCorrected.corrected && countryCorrected.correction) {
      issuingRaw = countryCorrected.value;
      issuingCorrected = true;
      if (!result.corrections.find((c) => c.field === "issuingCountry" && c.to === issuingRaw)) {
        result.corrections.push(countryCorrected.correction);
      }
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, issuingCorrected);

  let nameRaw = line1.length >= 36 ? line1.slice(5, 36) : line1.slice(5);
  const nameCorrected = applyNameRepairs(nameRaw, "name");
  if (nameCorrected.corrected && nameCorrected.correction) {
    nameRaw = nameCorrected.value;
    result.corrections.push(nameCorrected.correction);
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNumRaw = line2.slice(0, 9);
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNumRaw.replace(/</g, ""),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    passResult = selectBestCandidate(passNumRaw, candidates, passCd, "passportNumber");
    if (!passResult.corrected && passCd !== "<" && passCd !== "") {
      const dateCandidates = generateRepairCandidates(passNumRaw, "date");
      passResult = selectBestCandidate(passNumRaw, dateCandidates, passCd, "passportNumber");
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(passNumRaw)) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    if (candidates.length > 0) {
      passResult = {
        value: candidates[0]!.replace(/</g, ""),
        corrected: true,
        correction: { field: "passportNumber", from: passNumRaw, to: candidates[0]!, reason: "ocr_fix" },
      };
    }
  }

  if (passResult.correction) {
    const existing = result.corrections.find((c) => c.field === "passportNumber");
    if (!existing) {
      result.corrections.push(passResult.correction);
    }
  }

  result.passportNumber = createFieldResult(
    passResult.value.replace(/</g, ""),
    passNumRaw.replace(/</g, ""),
    passResult.value.replace(/</g, "").length > 0,
    passResult.corrected,
  );

  let natRaw = line2.slice(10, 13) || "";
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  let natCorrected = false;
  if (options.correctOcrErrors && natRaw.length > 0) {
    const nameFix = applyNameRepairs(natRaw, "nationality");
    if (nameFix.corrected && nameFix.correction) {
      natRaw = nameFix.value;
      natCorrected = true;
      result.corrections.push(nameFix.correction);
    }
    const countryFix = applyCountryRepairs(natRaw, "nationality");
    if (countryFix.corrected && countryFix.correction) {
      natRaw = countryFix.value;
      natCorrected = true;
      if (!result.corrections.find((c) => c.field === "nationality" && c.to === natRaw)) {
        result.corrections.push(countryFix.correction);
      }
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, natCorrected);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  const dobRepair = options.correctOcrErrors
    ? repairDateField(dobRaw, dobCd, "dateOfBirth", options.centuryBreak)
    : { value: parseMrzDate(dobRaw, options.centuryBreak), corrected: false };
  result.dateOfBirth = createFieldResult(dobRepair.value, dobRaw, dobRepair.value.length > 0, dobRepair.corrected);

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  const expiryRepair = options.correctOcrErrors
    ? repairDateField(expiryRaw, expiryCd, "expiryDate", options.centuryBreak)
    : { value: parseMrzDate(expiryRaw, options.centuryBreak), corrected: false };
  result.expiryDate = createFieldResult(
    expiryRepair.value,
    expiryRaw,
    expiryRepair.value.length > 0,
    expiryRepair.corrected,
  );

  const optRaw = line2.slice(28, 36);
  const optValue = optRaw.replace(/</g, "").trim();
  result.optionalData = createFieldResult(optValue, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(passNumRaw) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobRepair.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryRepair.corrected;
    const optCd = line2[35] || "";
    const optCdValid = computeCheckDigit(optRaw) === optCd || optCd === "<" || optCd === "";

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: optCdValid,
      final_composite_valid: passportCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid;
  }

  return result;
}

function parseTd1(line1: string, line2: string, line3: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2, line3]);
  result.format = "TD1";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  let issuingCorrected = false;
  if (options.correctOcrErrors && issuingRaw.length > 0) {
    const nameCorrected = applyNameRepairs(issuingRaw, "issuingCountry");
    if (nameCorrected.corrected && nameCorrected.correction) {
      issuingRaw = nameCorrected.value;
      issuingCorrected = true;
      result.corrections.push(nameCorrected.correction);
    }
    const countryCorrected = applyCountryRepairs(issuingRaw, "issuingCountry");
    if (countryCorrected.corrected && countryCorrected.correction) {
      issuingRaw = countryCorrected.value;
      issuingCorrected = true;
      if (!result.corrections.find((c) => c.field === "issuingCountry" && c.to === issuingRaw)) {
        result.corrections.push(countryCorrected.correction);
      }
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, issuingCorrected);

  let nameRaw = line1.length >= 30 ? line1.slice(5, 30) : line1.slice(5);
  const nameCorrected = applyNameRepairs(nameRaw, "name");
  if (nameCorrected.corrected && nameCorrected.correction) {
    nameRaw = nameCorrected.value;
    result.corrections.push(nameCorrected.correction);
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNumRaw = line2.slice(0, 9);
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNumRaw.replace(/</g, ""),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    passResult = selectBestCandidate(passNumRaw, candidates, passCd, "passportNumber");
    if (!passResult.corrected && passCd !== "<" && passCd !== "") {
      const dateCandidates = generateRepairCandidates(passNumRaw, "date");
      passResult = selectBestCandidate(passNumRaw, dateCandidates, passCd, "passportNumber");
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(passNumRaw)) {
    const candidates = generateRepairCandidates(passNumRaw, "passport_number");
    if (candidates.length > 0) {
      passResult = {
        value: candidates[0]!.replace(/</g, ""),
        corrected: true,
        correction: { field: "passportNumber", from: passNumRaw, to: candidates[0]!, reason: "ocr_fix" },
      };
    }
  }

  if (passResult.correction) {
    const existing = result.corrections.find((c) => c.field === "passportNumber");
    if (!existing) {
      result.corrections.push(passResult.correction);
    }
  }

  result.passportNumber = createFieldResult(
    passResult.value.replace(/</g, ""),
    passNumRaw.replace(/</g, ""),
    passResult.value.replace(/</g, "").length > 0,
    passResult.corrected,
  );

  let natRaw = line2.slice(10, 13) || "";
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  let natCorrected = false;
  if (options.correctOcrErrors && natRaw.length > 0) {
    const nameFix = applyNameRepairs(natRaw, "nationality");
    if (nameFix.corrected && nameFix.correction) {
      natRaw = nameFix.value;
      natCorrected = true;
      result.corrections.push(nameFix.correction);
    }
    const countryFix = applyCountryRepairs(natRaw, "nationality");
    if (countryFix.corrected && countryFix.correction) {
      natRaw = countryFix.value;
      natCorrected = true;
      if (!result.corrections.find((c) => c.field === "nationality" && c.to === natRaw)) {
        result.corrections.push(countryFix.correction);
      }
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, natCorrected);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  const dobRepair = options.correctOcrErrors
    ? repairDateField(dobRaw, dobCd, "dateOfBirth", options.centuryBreak)
    : { value: parseMrzDate(dobRaw, options.centuryBreak), corrected: false };
  result.dateOfBirth = createFieldResult(dobRepair.value, dobRaw, dobRepair.value.length > 0, dobRepair.corrected);

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  const expiryRepair = options.correctOcrErrors
    ? repairDateField(expiryRaw, expiryCd, "expiryDate", options.centuryBreak)
    : { value: parseMrzDate(expiryRaw, options.centuryBreak), corrected: false };
  result.expiryDate = createFieldResult(
    expiryRepair.value,
    expiryRaw,
    expiryRepair.value.length > 0,
    expiryRepair.corrected,
  );

  const optRaw = (line2.slice(28, 30) + (line3 || "")).replace(/</g, " ").trim();
  result.optionalData = createFieldResult(optRaw, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(passNumRaw) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobRepair.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryRepair.corrected;
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28);
    let compositeCdValid = true;
    if (line2.length >= 30) {
      const compositeCandidate = line2[29];
      if (compositeCandidate && compositeCandidate !== "<") {
        compositeCdValid = computeCheckDigit(compositeInput) === compositeCandidate;
      }
    }

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: true,
      final_composite_valid: compositeCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid && compositeCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid && compositeCdValid;
  }

  return result;
}

export function parseMrz(lines: string[], options?: MrzParserOptions): MrzParseResult {
  const opts: Required<MrzParserOptions> = { ...DEFAULT_OPTIONS, ...options };
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);

  if (cleaned.length < 2) {
    logger.warn("MrzParser: fewer than 2 MRZ lines provided", { count: cleaned.length });
    return emptyResult(cleaned);
  }

  const format = detectMrzFormat(cleaned);
  if (format === "UNKNOWN") {
    logger.warn("MrzParser: unknown MRZ format");
    return emptyResult(cleaned);
  }

  logger.debug("MrzParser: detected format", { format });

  switch (format) {
    case "TD3":
      return parseTd3(cleaned[0]!, cleaned[1]!, opts);
    case "TD2":
      return parseTd2(cleaned[0]!, cleaned[1]!, opts);
    case "TD1":
      return parseTd1(cleaned[0]!, cleaned[1]!, cleaned[2] || "", opts);
    default:
      return emptyResult(cleaned);
  }
}

export function validateMrzChecksums(lines: string[]): Record<string, boolean> & { overallValid: boolean } {
  const result = parseMrz(lines, { correctOcrErrors: false, validateChecksums: true });
  return { ...result.checkDigits, overallValid: result.overallValid };
}

export function computeMrzCheckDigit(value: string): string {
  return computeCheckDigit(value);
}
