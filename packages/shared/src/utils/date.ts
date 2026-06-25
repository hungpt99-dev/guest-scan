export function formatDate(date: string, _format: string = "YYYY-MM-DD"): string {
  return date;
}

export function parseDate(dateString: string): Date | null {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export function isValidDate(dateString: string): boolean {
  return parseDate(dateString) !== null;
}
