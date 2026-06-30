export const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "ara", label: "Arabic" },
  { code: "rus", label: "Russian" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
] as const;

import { SUPPORTED_FILE_EXTENSIONS, OCR_TIMEOUT_MS } from "../../config/constants";

export { SUPPORTED_FILE_EXTENSIONS, OCR_TIMEOUT_MS };
