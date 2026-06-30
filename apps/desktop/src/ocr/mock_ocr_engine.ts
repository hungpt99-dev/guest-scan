import type { OcrEngine, OcrInput, OcrTextResult, OcrTextChunk } from "./ocr_engine";

const DEFAULT_MRZ_LINE_1 = "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<";
const DEFAULT_MRZ_LINE_2 = "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04";

export type MockOcrConfig = {
  lines?: OcrTextChunk[];
  fullText?: string;
  averageConfidence?: number;
  failWithError?: boolean;
};

export class MockOcrEngine implements OcrEngine {
  private config: MockOcrConfig;

  constructor(config: MockOcrConfig = {}) {
    this.config = config;
  }

  setConfig(config: MockOcrConfig): void {
    this.config = config;
  }

  async extractText(_input: OcrInput): Promise<OcrTextResult> {
    if (this.config.failWithError) {
      throw new Error("Mock OCR engine simulated failure");
    }

    if (this.config.lines && this.config.fullText !== undefined && this.config.averageConfidence !== undefined) {
      return {
        lines: this.config.lines,
        fullText: this.config.fullText,
        averageConfidence: this.config.averageConfidence,
      };
    }

    const lines: OcrTextChunk[] = [
      { text: DEFAULT_MRZ_LINE_1, confidence: 0.95 },
      { text: DEFAULT_MRZ_LINE_2, confidence: 0.93 },
    ];

    return {
      lines,
      fullText: lines.map((l) => l.text).join("\n"),
      averageConfidence: 0.94,
    };
  }
}
