import type { TransformRule } from "@guestfill/shared";

type DateTransformPair = {
  from: string;
  to: string;
  apply: (value: string) => string;
};

const DATE_TRANSFORMS: DateTransformPair[] = [
  {
    from: "yyyy-MM-dd",
    to: "dd/MM/yyyy",
    apply: (v) => {
      const p = v.split("-");
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
    },
  },
  {
    from: "yyyy-MM-dd",
    to: "MM/dd/yyyy",
    apply: (v) => {
      const p = v.split("-");
      return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : v;
    },
  },
  {
    from: "dd/MM/yyyy",
    to: "yyyy-MM-dd",
    apply: (v) => {
      const p = v.split("/");
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
    },
  },
  {
    from: "MM/dd/yyyy",
    to: "yyyy-MM-dd",
    apply: (v) => {
      const p = v.split("/");
      return p.length === 3 ? `${p[2]}-${p[0]}-${p[1]}` : v;
    },
  },
  {
    from: "dd/MM/yyyy",
    to: "MM/dd/yyyy",
    apply: (v) => {
      const p = v.split("/");
      return p.length === 3 ? `${p[1]}/${p[0]}/${p[2]}` : v;
    },
  },
  {
    from: "yyyyMMdd",
    to: "dd/MM/yyyy",
    apply: (v) => (v.length === 8 ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${v.slice(0, 4)}` : v),
  },
  {
    from: "yyyyMMdd",
    to: "yyyy-MM-dd",
    apply: (v) => (v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v),
  },
  {
    from: "",
    to: "dd/MM/yyyy",
    apply: (v) => {
      const c = v.replace(/[/-]/g, "");
      return c.length === 8 ? `${c.slice(6, 8)}/${c.slice(4, 6)}/${c.slice(0, 4)}` : v;
    },
  },
  {
    from: "",
    to: "yyyy-MM-dd",
    apply: (v) => {
      const c = v.replace(/[/]/g, "");
      return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}` : v;
    },
  },
];

const ISO2_TO_ISO3: Record<string, string> = {
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
  MM: "MMR",
  LA: "LAO",
  KH: "KHM",
  MO: "MAC",
  MN: "MNG",
  NP: "NPL",
  LK: "LKA",
  KZ: "KAZ",
  UZ: "UZB",
  QA: "QAT",
  KW: "KWT",
  OM: "OMN",
  IR: "IRN",
};

const ISO3_TO_NAME: Record<string, string> = {
  VNM: "Vietnam",
  USA: "United States",
  KOR: "South Korea",
  CHN: "China",
  JPN: "Japan",
  FRA: "France",
  DEU: "Germany",
  GBR: "United Kingdom",
  ITA: "Italy",
  ESP: "Spain",
  CAN: "Canada",
  AUS: "Australia",
  BRA: "Brazil",
  IND: "India",
  RUS: "Russia",
  MEX: "Mexico",
  IDN: "Indonesia",
  NLD: "Netherlands",
  SAU: "Saudi Arabia",
  CHE: "Switzerland",
  SWE: "Sweden",
  NOR: "Norway",
  DNK: "Denmark",
  FIN: "Finland",
  BEL: "Belgium",
  AUT: "Austria",
  PRT: "Portugal",
  GRC: "Greece",
  IRL: "Ireland",
  NZL: "New Zealand",
  SGP: "Singapore",
  MYS: "Malaysia",
  THA: "Thailand",
  PHL: "Philippines",
  HKG: "Hong Kong",
  TWN: "Taiwan",
  ARG: "Argentina",
  CHL: "Chile",
  COL: "Colombia",
  ZAF: "South Africa",
  EGY: "Egypt",
  NGA: "Nigeria",
  KEN: "Kenya",
  TUR: "Türkiye",
  POL: "Poland",
  CZE: "Czech Republic",
  HUN: "Hungary",
  ROU: "Romania",
  UKR: "Ukraine",
  ISR: "Israel",
  ARE: "United Arab Emirates",
  PAK: "Pakistan",
  BGD: "Bangladesh",
  MMR: "Myanmar",
  LAO: "Laos",
  KHM: "Cambodia",
  MAC: "Macau",
  MNG: "Mongolia",
  NPL: "Nepal",
  LKA: "Sri Lanka",
  KAZ: "Kazakhstan",
  UZB: "Uzbekistan",
  QAT: "Qatar",
  KWT: "Kuwait",
  OMN: "Oman",
  IRN: "Iran",
};

function applyDateFormat(value: string, rule: TransformRule): string {
  if (rule.type !== "date_format") return value;
  for (const t of DATE_TRANSFORMS) {
    if (t.from === (rule.from ?? "") && t.to === rule.to) {
      return t.apply(value);
    }
  }
  return value;
}

function applyPhoneFormat(value: string, rule: TransformRule): string {
  if (rule.type !== "phone_format") return value;
  const digits = value.replace(/\D/g, "");
  const cc = rule.countryCode ?? "84";
  if (rule.format === "local") {
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }
  if (rule.format === "international") {
    if (digits.startsWith(cc)) return `+${digits}`;
    if (digits.startsWith("0")) return `+${cc}${digits.slice(1)}`;
    return `+${cc}${digits}`;
  }
  return value;
}

export function applyTransforms(value: string, transforms: TransformRule[]): string {
  let result = value;
  for (const rule of transforms) {
    result = applyTransform(result, rule);
  }
  return result;
}

function applyTransform(value: string, rule: TransformRule): string {
  switch (rule.type) {
    case "trim":
      return value.trim();
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "titlecase":
      return value.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case "date_format":
      return applyDateFormat(value, rule);
    case "gender_format": {
      const upper = value.toUpperCase();
      return rule.mapping[upper] ?? value;
    }
    case "country_format": {
      if (rule.format === "ISO3" && value.length === 2) return countryIso2ToIso3(value);
      if (rule.format === "NAME" && value.length === 3) return countryIso3ToName(value);
      if (rule.format === "NAME" && value.length === 2) {
        const iso3 = countryIso2ToIso3(value);
        return iso3 !== value ? countryIso3ToName(iso3) : value;
      }
      return value;
    }
    case "strip": {
      const pattern = rule.chars ? new RegExp(`[${rule.chars}]`, "g") : /[^a-zA-Z0-9]/g;
      return value.replace(pattern, "");
    }
    case "phone_format":
      return applyPhoneFormat(value, rule);
    case "replace":
      return value.split(rule.from).join(rule.to);
    case "prefix":
      return rule.value + value;
    case "suffix":
      return value + rule.value;
    case "custom_mapping":
      return rule.mapping[value] ?? value;
    default:
      return value;
  }
}

export function countryIso2ToIso3(code: string): string {
  return ISO2_TO_ISO3[code.toUpperCase()] ?? code;
}

export function countryIso3ToName(code: string): string {
  return ISO3_TO_NAME[code.toUpperCase()] ?? code;
}
