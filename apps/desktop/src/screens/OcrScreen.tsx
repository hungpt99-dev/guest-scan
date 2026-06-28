import { useState } from "react";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import ErrorMessage from "../components/common/ErrorMessage";
import LoadingState from "../components/common/LoadingState";
import { selectFiles, selectFolder, selectOutputFile, runOcr } from "../features/ocr/ocrApi";

export default function OcrScreen() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [outputPath, setOutputPath] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleSelectFiles = async () => {
    try {
      const files = await selectFiles();
      if (files && files.length > 0) {
        setSelectedFiles(files);
        setError(null);
      }
    } catch (e) {
      setError(`Could not open file dialog: ${e}`);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folder = await selectFolder();
      if (folder) {
        setSelectedFiles([folder]);
        setError(null);
      }
    } catch (e) {
      setError(`Could not open folder dialog: ${e}`);
    }
  };

  const handleSelectOutput = async () => {
    try {
      const file = await selectOutputFile();
      if (file) {
        setOutputPath(file);
        setError(null);
      }
    } catch (e) {
      setError(`Could not open save dialog: ${e}`);
    }
  };

  const handleCreateExcel = async () => {
    if (selectedFiles.length === 0 || !outputPath) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const response = await runOcr({
        files: selectedFiles,
        outputPath,
        options: {
          documentMode: "auto",
          deleteTempFiles: true,
          progressPath: outputPath.replace(".xlsx", "_progress.json"),
        },
      });

      if (response.status === "COMPLETED") {
        setResult(
          `Completed: ${response.summary.totalDocuments} document(s) processed. ` +
            `${response.summary.ready} ready, ${response.summary.needReview} need review, ` +
            `${response.summary.failed} failed.`,
        );
      } else {
        const errorMsg = response.errors.map((e) => e.message).join("; ");
        setError(`OCR failed: ${errorMsg}`);
      }
    } catch (e) {
      setError(`Failed to run OCR: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">OCR — Create Excel from Documents</h1>

      <Card title="Step 1: Select Source Documents">
        <div className="space-y-4">
          <div className="flex gap-4">
            <Button variant="secondary" onClick={handleSelectFiles}>
              Select Files
            </Button>
            <Button variant="secondary" onClick={handleSelectFolder}>
              Select Folder
            </Button>
          </div>
          {selectedFiles.length > 0 ? (
            <div>
              <p className="text-sm text-gray-600">{selectedFiles.length} file(s) selected</p>
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-500">
                {selectedFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No files selected</p>
          )}
        </div>
      </Card>

      <Card title="Step 2: Choose Output">
        <div className="space-y-4">
          <Button variant="secondary" onClick={handleSelectOutput}>
            Choose Output File
          </Button>
          {outputPath && <p className="break-all text-sm text-gray-600">Output: {outputPath}</p>}
        </div>
      </Card>

      <Card title="Step 3: Run OCR">
        <Button disabled={selectedFiles.length === 0 || !outputPath || processing} onClick={handleCreateExcel}>
          {processing ? "Processing..." : "Create Excel"}
        </Button>
        {processing && <LoadingState message="Processing documents..." />}
      </Card>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {result && (
        <Card title="Result" className="border-2 border-green-200">
          <p className="text-sm text-gray-700">{result}</p>
          {outputPath && <p className="mt-2 text-xs text-gray-500">Excel saved to: {outputPath}</p>}
        </Card>
      )}
    </div>
  );
}
