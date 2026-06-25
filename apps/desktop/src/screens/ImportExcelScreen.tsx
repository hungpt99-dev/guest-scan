import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ErrorMessage from "../components/common/ErrorMessage";
import LoadingState from "../components/common/LoadingState";
import { importExcelFromPath } from "../features/excel/excelImport";
import type { ImportSummary } from "../features/fill/fillTypes";
import { setSession } from "../features/fill/fillStore";

export default function ImportExcelScreen() {
  const navigate = useNavigate();
  const [excelPath, setExcelPath] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [_sessionId, setSessionId] = useState<string>("");

  const handleSelectFile = async () => {
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selected = await open({
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setExcelPath(selected);
        setError(null);
        setSummary(null);
      }
    } catch {
      setError("Could not open file dialog.");
    }
  };

  const handleImport = async () => {
    if (!excelPath) return;
    setImporting(true);
    setError(null);

    try {
      const result = await importExcelFromPath(excelPath);
      if (result.success) {
        setSummary(result.summary);
        setSessionId(result.sessionId);
        setSession({
          id: result.sessionId,
          excelPath,
          excelFileHash: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          totalRows: result.summary.imported,
          readyCount: result.summary.ready,
          needReviewCount: result.summary.needReview,
          missingDataCount: result.summary.missingData,
          failedCount: result.summary.failed,
        });
      } else {
        setError(result.errors.map((e) => e.message).join("; "));
      }
    } catch (e) {
      setError(`Import failed: ${e}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Import Excel</h1>

      <Card title="Step 1: Select Reviewed Excel File">
        <div className="space-y-4">
          <Button variant="secondary" onClick={handleSelectFile}>
            Select Excel File
          </Button>
          {excelPath && <p className="text-sm text-gray-600 break-all">Selected: {excelPath}</p>}
          {!excelPath && <p className="text-sm text-gray-400">No file selected</p>}
        </div>
      </Card>

      <Card title="Step 2: Import">
        <div className="space-y-4">
          <Button disabled={!excelPath || importing} onClick={handleImport}>
            {importing ? "Importing..." : "Import and Review"}
          </Button>
          {importing && <LoadingState message="Importing Excel data..." />}
        </div>
      </Card>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {summary && (
        <Card title="Import Summary" className="border-2 border-green-200">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{summary.imported}</p>
              <p className="text-xs text-gray-600">Imported Guests</p>
            </div>
            <div className="rounded bg-green-50 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{summary.ready}</p>
              <p className="text-xs text-gray-600">Ready</p>
            </div>
            <div className="rounded bg-yellow-50 p-3 text-center">
              <p className="text-2xl font-bold text-yellow-700">{summary.needReview}</p>
              <p className="text-xs text-gray-600">Need Review</p>
            </div>
            <div className="rounded bg-orange-50 p-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{summary.missingData}</p>
              <p className="text-xs text-gray-600">Missing Data</p>
            </div>
            <div className="rounded bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{summary.failed}</p>
              <p className="text-xs text-gray-600">Failed</p>
            </div>
            {summary.duplicateDocuments > 0 && (
              <div className="rounded bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{summary.duplicateDocuments}</p>
                <p className="text-xs text-gray-600">Duplicates</p>
              </div>
            )}
            <div className="rounded bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{summary.skippedEmpty}</p>
              <p className="text-xs text-gray-600">Skipped Empty</p>
            </div>
          </div>
          <div className="mt-6 flex gap-4">
            <Button onClick={() => navigate(ROUTES.GUESTS)}>View Guest List</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSummary(null);
                setExcelPath("");
              }}
            >
              Import Another File
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
