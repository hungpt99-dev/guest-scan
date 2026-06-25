export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return fileName.slice(dotIndex).toLowerCase();
}

export function isImageFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return [".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp"].includes(ext);
}

export function isPdfFile(fileName: string): boolean {
  return getFileExtension(fileName) === ".pdf";
}

export function isSupportedFile(fileName: string): boolean {
  return isImageFile(fileName) || isPdfFile(fileName);
}

export function generateFileName(prefix: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}_${timestamp}${ext}`;
}
