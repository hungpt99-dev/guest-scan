import { imageDataToGrayscale, sobelEdgeDetection, clamp, makeImageData, createCanvas } from "./image_utils";

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corners = [Point, Point, Point, Point];

function findDocumentCorners(edges: Float64Array, width: number, height: number): Corners | null {
  const threshold = 100;
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    binary[i] = edges[i]! > threshold ? 255 : 0;
  }

  const topScan = 0.15;
  const bottomScan = 0.15;
  const leftScan = 0.15;
  const rightScan = 0.15;

  let top: number | null = null;
  let bottom: number | null = null;
  let left: number | null = null;
  let right: number | null = null;

  const startY = Math.floor(height * topScan);
  const endY = Math.floor(height * (1 - bottomScan));
  const startX = Math.floor(width * leftScan);
  const endX = Math.floor(width * (1 - rightScan));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (binary[y * width + x] === 255) {
        if (top === null) top = y;
        bottom = y;
        if (left === null || x < left) left = x;
        if (right === null || x > right) right = x;
        break;
      }
    }
  }

  if (top === null || bottom === null || left === null || right === null) return null;

  const margin = 5;
  return [
    { x: Math.max(0, left - margin), y: Math.max(0, top - margin) },
    { x: Math.min(width - 1, right + margin), y: Math.max(0, top - margin) },
    { x: Math.min(width - 1, right + margin), y: Math.min(height - 1, bottom + margin) },
    { x: Math.max(0, left - margin), y: Math.min(height - 1, bottom + margin) },
  ];
}

export function detectDocument(imageData: ImageData): Rectangle | null {
  const { width, height } = imageData;
  const gray = imageDataToGrayscale(imageData);
  const edges = sobelEdgeDetection(gray, width, height);
  const corners = findDocumentCorners(edges, width, height);
  if (!corners) return null;

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function cropImage(imageData: ImageData, bounds: Rectangle): ImageData {
  const { data, width, height } = imageData;
  const x = Math.round(clamp(bounds.x, 0, width - 1));
  const y = Math.round(clamp(bounds.y, 0, height - 1));
  const w = Math.round(clamp(bounds.width, 1, width - x));
  const h = Math.round(clamp(bounds.height, 1, height - y));

  const outData = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcIdx = ((y + row) * width + (x + col)) * 4;
      const dstIdx = (row * w + col) * 4;
      outData[dstIdx] = data[srcIdx]!;
      outData[dstIdx + 1] = data[srcIdx + 1]!;
      outData[dstIdx + 2] = data[srcIdx + 2]!;
      outData[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }
  return makeImageData(outData, w, h);
}

export function correctPerspective(imageData: ImageData, corners: Corners): ImageData {
  const { width, height } = imageData;
  const { ctx } = createCanvas(width, height);
  ctx.putImageData(imageData, 0, 0);

  const newWidth = Math.round(
    Math.max(Math.abs(corners[1]!.x - corners[0]!.x), Math.abs(corners[3]!.x - corners[2]!.x)),
  );
  const newHeight = Math.round(
    Math.max(Math.abs(corners[3]!.y - corners[0]!.y), Math.abs(corners[2]!.y - corners[1]!.y)),
  );
  const nw = Math.max(1, newWidth);
  const nh = Math.max(1, newHeight);

  const { ctx: warpCtx } = createCanvas(nw, nh);

  const sx0 = corners[0]!.x;
  const sy0 = corners[0]!.y;
  const sx1 = corners[1]!.x;
  const sy1 = corners[1]!.y;
  const sx2 = corners[2]!.x;
  const sy2 = corners[2]!.y;
  const sx3 = corners[3]!.x;
  const sy3 = corners[3]!.y;

  const dx0 = 0;
  const dy0 = 0;
  const dx1 = nw;
  const dy1 = 0;
  const dx2 = nw;
  const dy2 = nh;
  const dx3 = 0;
  const dy3 = nh;

  const srcData = ctx.getImageData(0, 0, width, height);

  const transform = computePerspectiveTransform(
    [sx0, sy0, sx1, sy1, sx2, sy2, sx3, sy3],
    [dx0, dy0, dx1, dy1, dx2, dy2, dx3, dy3],
  );

  if (!transform) return imageData;

  const outData = warpCtx.createImageData(nw, nh);
  const dst = outData.data;
  const src = srcData.data;

  for (let dy = 0; dy < nh; dy++) {
    for (let dx = 0; dx < nw; dx++) {
      const denom = transform[6] * dx + transform[7] * dy + 1;
      if (Math.abs(denom) < 1e-10) continue;
      const sx = (transform[0] * dx + transform[1] * dy + transform[2]) / denom;
      const sy = (transform[3] * dx + transform[4] * dy + transform[5]) / denom;

      if (sx < 0 || sx >= width - 1 || sy < 0 || sy >= height - 1) continue;

      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;

      const srcIdx = (iy * width + ix) * 4;
      const dstIdx = (dy * nw + dx) * 4;

      for (let c = 0; c < 4; c++) {
        const p00 = src[srcIdx + c]!;
        const p10 = src[srcIdx + 4 + c]!;
        const p01 = src[srcIdx + width * 4 + c]!;
        const p11 = src[srcIdx + width * 4 + 4 + c]!;

        const interpolated = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
        dst[dstIdx + c] = clamp(Math.round(interpolated), 0, 255);
      }
    }
  }

  return outData;
}

function computePerspectiveTransform(
  src: [number, number, number, number, number, number, number, number],
  dst: [number, number, number, number, number, number, number, number],
): [number, number, number, number, number, number, number, number] | null {
  const a = computeHomographyMatrix(src, dst);
  if (!a) return null;
  return [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!, a[7]!];
}

function computeHomographyMatrix(
  src: [number, number, number, number, number, number, number, number],
  dst: [number, number, number, number, number, number, number, number],
): number[] | null {
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i * 2]!;
    const sy = src[i * 2 + 1]!;
    const dx = dst[i * 2]!;
    const dy = dst[i * 2 + 1]!;

    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }

  return solveLinearSystem8(A, B);
}

function solveLinearSystem8(A: number[][], B: number[]): number[] | null {
  const n = 8;
  const aug: number[][] = A.map((row, i) => [...row, B[i]!]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row]![col]!) > Math.abs(aug[maxRow]![col]!)) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow]!, aug[col]!];

    const pivot = aug[col]![col]!;
    if (Math.abs(pivot) < 1e-12) return null;

    for (let row = col; row <= n; row++) {
      aug[col]![row] = aug[col]![row]! / pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      for (let j = col; j <= n; j++) {
        aug[row]![j] = aug[row]![j]! - factor * aug[col]![j]!;
      }
    }
  }

  return aug.map((row) => row[n]!);
}
