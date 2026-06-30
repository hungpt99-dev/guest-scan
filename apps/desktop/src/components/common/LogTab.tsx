import { useState, useEffect, useRef } from "react";
import { getLogs, clearLogs, type LogEntry } from "../../services/loggingService";
import Button from "./Button";
import Card from "./Card";

export default function LogTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(getLogs());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleClear = () => {
    clearLogs();
    setLogs([]);
  };

  const handleRefresh = () => {
    setLogs(getLogs());
  };

  return (
    <Card title="Application Logs">
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={handleRefresh}>
          Refresh
        </Button>
        <Button variant="ghost" onClick={handleClear}>
          Clear Logs
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-400">No logs yet.</p>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-gray-400">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-gray-700">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </Card>
  );
}
