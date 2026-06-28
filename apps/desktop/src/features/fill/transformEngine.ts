import type { TransformRule } from "@guestfill/shared";

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
    case "date_format": {
      if (!value) return value;
      if (rule.from === "yyyy-MM-dd" && rule.to === "dd/MM/yyyy") {
        const parts = value.split("-");
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      if (rule.from === "yyyy-MM-dd" && rule.to === "MM/dd/yyyy") {
        const parts = value.split("-");
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
      }
      if (rule.from === "dd/MM/yyyy" && rule.to === "yyyy-MM-dd") {
        const parts = value.split("/");
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (rule.from === "MM/dd/yyyy" && rule.to === "yyyy-MM-dd") {
        const parts = value.split("/");
        if (parts.length === 3) return `${parts[2]}-${parts[0]}-${parts[1]}`;
      }
      if (rule.from === "dd/MM/yyyy" && rule.to === "MM/dd/yyyy") {
        const parts = value.split("/");
        if (parts.length === 3) return `${parts[1]}/${parts[0]}/${parts[2]}`;
      }
      if (rule.from === "yyyyMMdd" && rule.to === "dd/MM/yyyy") {
        if (value.length === 8) {
          return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
        }
      }
      if (rule.from === "yyyyMMdd" && rule.to === "yyyy-MM-dd") {
        if (value.length === 8) {
          return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        }
      }
      if (!rule.from && rule.to === "dd/MM/yyyy") {
        const cleaned = value.replace(/[/-]/g, "");
        if (cleaned.length === 8) {
          return `${cleaned.slice(6, 8)}/${cleaned.slice(4, 6)}/${cleaned.slice(0, 4)}`;
        }
      }
      if (!rule.from && rule.to === "yyyy-MM-dd") {
        const cleaned = value.replace(/[/]/g, "");
        if (cleaned.length === 8) {
          return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
        }
      }
      return value;
    }
    case "gender_format": {
      const upper = value.toUpperCase();
      return rule.mapping[upper] ?? value;
    }
    case "country_format": {
      if (rule.format === "ISO3" && value.length === 2) {
        return countryIso2ToIso3(value);
      }
      if (rule.format === "NAME" && value.length === 3) {
        return countryIso3ToName(value);
      }
      if (rule.format === "NAME" && value.length === 2) {
        const iso3 = countryIso2ToIso3(value);
        if (iso3 !== value) return countryIso3ToName(iso3);
      }
      return value;
    }
    case "strip": {
      const pattern = rule.chars ? new RegExp(`[${rule.chars}]`, "g") : /[^a-zA-Z0-9]/g;
      return value.replace(pattern, "");
    }
    case "phone_format": {
      const digits = value.replace(/\D/g, "");
      if (rule.format === "local") {
        if (digits.length >= 10) return digits.slice(-10);
        return digits;
      }
      if (rule.format === "international") {
        const cc = rule.countryCode ?? "84";
        if (digits.startsWith(cc)) return `+${digits}`;
        if (digits.startsWith("0")) return `+${cc}${digits.slice(1)}`;
        return `+${cc}${digits}`;
      }
      return value;
    }
    case "replace":
      return value.split(rule.from).join(rule.to);
    case "prefix":
      return rule.value + value;
    case "suffix":
      return value + rule.value;
    case "custom_mapping": {
      return rule.mapping[value] ?? value;
    }
    default:
      return value;
  }
}

function countryIso2ToIso3(code: string): string {
  const map: Record<string, string> = {
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
  return map[code.toUpperCase()] ?? code;
}

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

function countryIso3ToName(code: string): string {
  return ISO3_TO_NAME[code.toUpperCase()] ?? code;
}
