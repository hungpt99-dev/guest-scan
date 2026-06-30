export type OcrInput = {
  imagePath: string;
};

export type OcrTextChunk = {
  text: string;
  confidence: number;
};

export type OcrTextResult = {
  lines: OcrTextChunk[];
  fullText: string;
  averageConfidence: number;
};

export interface OcrEngine {
  extractText(input: OcrInput): Promise<OcrTextResult>;
}
