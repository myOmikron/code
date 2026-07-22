//! On-device OCR of a card's title line. Used as a fallback identity signal when perceptual
//! matching is uncertain. Runs inside the scan worker; the Tesseract runtime + English model
//! are self-hosted under /tesseract (see scripts/setup-ocr-assets.mjs), so no network/CDN.
import { createWorker, PSM } from "tesseract.js";

// The source is a high-res crop of the card's top ~30% (see createTitleOcrSource). Keep the
// left ~68% to drop the mana cost; keep the full height so the title line is included
// regardless of small vertical shifts from card-edge detection.
const TITLE_REGION = { x: 0.0, y: 0.0, width: 0.68, height: 1.0 };
const CONTRAST = 1.6;

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
let workerPromise: Promise<TesseractWorker> | null = null;

function ocrWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract",
    }).then(async (worker) => {
      // SINGLE_BLOCK lets Tesseract find the title line within the band.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return worker;
    });
  }
  return workerPromise;
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  const width = "width" in source ? Number(source.width) : 1000;
  const height = "height" in source ? Number(source.height) : 419;
  return { width: width || 1000, height: height || 419 };
}

function lumaOf(pixels: Uint8ClampedArray, out: Float32Array): void {
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    out[p] = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
  }
}

// Crops off the mana cost, then flattens the horizontal glare/shadow gradient by subtracting
// each column's vertical-mean background and stretches the residual contrast — the single
// biggest OCR win on phone photos (mirrors the sharp-CLAHE spike). The source is already
// high-res, so no upscaling. Returns a grayscale PNG blob Tesseract can read.
async function titleCropBlob(source: CanvasImageSource): Promise<Blob> {
  const { width, height } = sourceSize(source);
  const targetWidth = Math.max(1, Math.round(TITLE_REGION.width * width));
  const targetHeight = Math.max(1, Math.round(TITLE_REGION.height * height));

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
  context.drawImage(
    source,
    TITLE_REGION.x * width,
    TITLE_REGION.y * height,
    targetWidth,
    targetHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  const image = context.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = image.data;
  const luma = new Float32Array(targetWidth * targetHeight);
  lumaOf(pixels, luma);

  // Per-column background: mean luma over the column (within a horizontal smoothing band).
  const band = Math.max(1, Math.round(targetWidth / 10));
  const background = new Float32Array(targetWidth);
  for (let x = 0; x < targetWidth; x += 1) {
    let sum = 0;
    let count = 0;
    for (let bx = Math.max(0, x - band); bx <= Math.min(targetWidth - 1, x + band); bx += 1) {
      for (let y = 0; y < targetHeight; y += 1) {
        sum += luma[y * targetWidth + bx];
        count += 1;
      }
    }
    background[x] = sum / count;
  }

  for (let y = 0, p = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1, p += 1) {
      const value = 128 + (luma[p] - background[x]) * CONTRAST;
      const clamped = value < 0 ? 0 : value > 255 ? 255 : value;
      const offset = p * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = clamped;
      pixels[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

/** OCR the title of a card from a high-res top-strip image; returns the raw recognized text
 *  (may be multi-line — callers match each line against the card-name vocabulary). */
export async function recognizeCardTitle(source: CanvasImageSource): Promise<string> {
  const blob = await titleCropBlob(source);
  const worker = await ocrWorker();
  const { data } = await worker.recognize(blob);
  return data.text.trim();
}
