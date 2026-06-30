export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

import { IMAGE_EXTENSIONS, PDF_EXTENSION } from "../config/constants";

export function isImageFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isPdfFile(fileName: string): boolean {
  return getFileExtension(fileName) === PDF_EXTENSION;
}

export function isSupportedFile(fileName: string): boolean {
  return isImageFile(fileName) || isPdfFile(fileName);
}

export function generateFileName(prefix: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}_${timestamp}${ext}`;
}
