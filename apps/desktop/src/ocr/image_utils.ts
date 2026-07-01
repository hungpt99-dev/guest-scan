export function imageDataSource(): typeof ImageData | undefined {
  if (typeof ImageData !== "undefined") return ImageData;
  return undefined;
}

export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas 2D context");
  return { canvas, ctx };
}

export function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  const ID = imageDataSource();
  if (ID) {
    return new ID(data as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
  }
  const { ctx } = createCanvas(width, height);
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  return imageData;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getPixel(data: Float64Array | Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[y * width + x]!;
}

export function imageDataToGrayscale(imageData: ImageData): Float64Array {
  const { data, width, height } = imageData;
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
  }
  return gray;
}

export function sobelEdgeDetection(gray: Float64Array, width: number, height: number): Float64Array {
  const edges = new Float64Array(width * height);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0;
      let sumY = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = getPixel(gray, width, x + kx, y + ky);
          const ki = (ky + 1) * 3 + (kx + 1);
          sumX += pixel * gx[ki]!;
          sumY += pixel * gy[ki]!;
        }
      }
      const magnitude = Math.sqrt(sumX * sumX + sumY * sumY);
      edges[y * width + x] = magnitude;
    }
  }
  return edges;
}

export function extractImageData(
  source: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
): Promise<ImageData> {
  const ID = imageDataSource();
  if (ID && source instanceof ID) return Promise.resolve(source);

  return new Promise((resolve, reject) => {
    let img: HTMLImageElement;

    if (typeof source === "string") {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = source;
    } else if (source instanceof HTMLImageElement) {
      img = source;
    } else if (source instanceof HTMLCanvasElement) {
      const ctx = source.getContext("2d");
      if (!ctx) return reject(new Error("Failed to get canvas context"));
      resolve(ctx.getImageData(0, 0, source.width, source.height));
      return;
    } else if (source instanceof HTMLVideoElement) {
      const { ctx } = createCanvas(source.videoWidth, source.videoHeight);
      ctx.drawImage(source, 0, 0);
      resolve(ctx.getImageData(0, 0, source.videoWidth, source.videoHeight));
      return;
    } else {
      reject(new Error("Unsupported image source type"));
      return;
    }

    img.onload = () => {
      const { ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
  });
}
