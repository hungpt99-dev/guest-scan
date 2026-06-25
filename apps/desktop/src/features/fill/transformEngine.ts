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
      if (!rule.from && rule.to === "dd/MM/yyyy") {
        const cleaned = value.replace(/[/-]/g, "");
        if (cleaned.length === 8) {
          return `${cleaned.slice(6, 8)}/${cleaned.slice(4, 6)}/${cleaned.slice(0, 4)}`;
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
        };
        return map[value.toUpperCase()] ?? value;
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
