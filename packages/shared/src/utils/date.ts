export function formatDate(date: string, _format: string = "YYYY-MM-DD"): string {
  if (!date) return date;
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  switch (_format) {
    case "dd/MM/yyyy":
      return `${day}/${month}/${year}`;
    case "MM/dd/yyyy":
      return `${month}/${day}/${year}`;
    case "yyyy-MM-dd":
    default:
      return `${year}-${month}-${day}`;
  }
}

export function parseDate(dateString: string): Date | null {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export function isValidDate(dateString: string): boolean {
  return parseDate(dateString) !== null;
}
