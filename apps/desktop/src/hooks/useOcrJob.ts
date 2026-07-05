import { useState, useCallback } from "react";
import { selectFiles, selectFolder, selectOutputFile, runOcr } from "../features/ocr/ocrApi";

export interface OcrJobState {
  selectedFiles: string[];
  outputPath: string;
  processing: boolean;
  error: string | null;
  result: string | null;
}

export interface UseOcrJobReturn {
  state: OcrJobState;
  handleSelectFiles: () => Promise<void>;
  handleSelectFolder: () => Promise<void>;
  handleSelectOutput: () => Promise<void>;
  handleRunOcr: () => Promise<void>;
  setError: (error: string | null) => void;
  reset: () => void;
}

export function useOcrJob(): UseOcrJobReturn {
  const [state, setState] = useState<OcrJobState>({
    selectedFiles: [],
    outputPath: "",
    processing: false,
    error: null,
    result: null,
  });

  const handleSelectFiles = useCallback(async () => {
    try {
      const files = await selectFiles();
      if (files && files.length > 0) {
        setState((prev) => ({ ...prev, selectedFiles: files, error: null }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: `Could not open file dialog: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }, []);

  const handleSelectFolder = useCallback(async () => {
    try {
      const folder = await selectFolder();
      if (folder) {
        setState((prev) => ({ ...prev, selectedFiles: [folder], error: null }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: `Could not open folder dialog: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }, []);

  const handleSelectOutput = useCallback(async () => {
    try {
      const file = await selectOutputFile();
      if (file) {
        setState((prev) => ({ ...prev, outputPath: file, error: null }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: `Could not open save dialog: ${e instanceof Error ? e.message : String(e)}`,
      }));
    }
  }, []);

  const handleRunOcr = useCallback(async () => {
    const { selectedFiles, outputPath } = state;
    if (selectedFiles.length === 0 || !outputPath) return;

    setState((prev) => ({ ...prev, processing: true, error: null, result: null }));

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
        setState((prev) => ({
          ...prev,
          processing: false,
          result:
            `Completed: ${response.summary.totalDocuments} document(s) processed. ` +
            `${response.summary.ready} ready, ${response.summary.needReview} need review, ` +
            `${response.summary.failed} failed.`,
        }));
      } else {
        const errorMsg = response.errors.map((e) => e.message).join("; ");
        setState((prev) => ({ ...prev, processing: false, error: `OCR failed: ${errorMsg}` }));
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : typeof e === "object" && e !== null ? JSON.stringify(e) : String(e);
      setState((prev) => ({ ...prev, processing: false, error: `Failed to run OCR: ${errorMessage}` }));
    }
  }, [state.selectedFiles, state.outputPath]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const reset = useCallback(() => {
    setState({ selectedFiles: [], outputPath: "", processing: false, error: null, result: null });
  }, []);

  return { state, handleSelectFiles, handleSelectFolder, handleSelectOutput, handleRunOcr, setError, reset };
}
