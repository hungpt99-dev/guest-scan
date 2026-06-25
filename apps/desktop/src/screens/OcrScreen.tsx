import { useState } from "react";
import Card from "../components/common/Card";
import Button from "../components/common/Button";

export default function OcrScreen() {
  const [selectedFiles, _setSelectedFiles] = useState<string[]>([]);
  const [outputPath, _setOutputPath] = useState<string>("");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">OCR — Create Excel from Documents</h1>

      <Card title="Step 1: Select Source Documents">
        <div className="space-y-4">
          <div className="flex gap-4">
            <Button variant="secondary" onClick={() => {}}>
              Select Files
            </Button>
            <Button variant="secondary" onClick={() => {}}>
              Select Folder
            </Button>
          </div>
          {selectedFiles.length > 0 && <p className="text-sm text-gray-600">{selectedFiles.length} file(s) selected</p>}
          {selectedFiles.length === 0 && <p className="text-sm text-gray-400">No files selected</p>}
        </div>
      </Card>

      <Card title="Step 2: Choose Output">
        <div className="space-y-4">
          <Button variant="secondary" onClick={() => {}}>
            Choose Output File
          </Button>
          {outputPath && <p className="text-sm text-gray-600">Output: {outputPath}</p>}
        </div>
      </Card>

      <Card title="Step 3: Run OCR">
        <Button disabled={selectedFiles.length === 0 || !outputPath} onClick={() => {}}>
          Create Excel
        </Button>
      </Card>
    </div>
  );
}
