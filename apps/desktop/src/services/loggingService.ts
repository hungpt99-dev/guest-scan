export type LogEntry = {
  timestamp: string;
  message: string;
};

const logs: LogEntry[] = [];

export function addLog(message: string): void {
  logs.push({ timestamp: new Date().toISOString(), message });
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}
