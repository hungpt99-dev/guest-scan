export type TransformRule =
  | { type: "trim" }
  | { type: "uppercase" }
  | { type: "lowercase" }
  | { type: "titlecase" }
  | { type: "date_format"; from?: string; to: string }
  | { type: "gender_format"; mapping: Record<string, string> }
  | { type: "country_format"; format: "ISO3" | "NAME" }
  | { type: "replace"; from: string; to: string }
  | { type: "prefix"; value: string }
  | { type: "suffix"; value: string }
  | { type: "custom_mapping"; mapping: Record<string, string> }
  | { type: "strip"; chars?: string }
  | { type: "phone_format"; format: "local" | "international"; countryCode?: string };
