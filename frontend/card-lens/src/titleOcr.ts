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

// Live progress of the current recognize() call (0..1), forwarded from Tesseract's logger to
// whoever called recognizeCardTitle. Module-level because the worker (and its logger) is created
// once and reused; only one recognize runs at a time.
let recognizeProgress: ((fraction: number) => void) | null = null;

function ocrWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract",
      logger: (m) => {
        if (m.status === "recognizing text" && recognizeProgress) recognizeProgress(m.progress);
      },
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

// Locate the title text band within the strip by its horizontal-edge energy per row: the
// title is a high-contrast line of text near the top, so its rows spike in |dLuma/dx|, while
// a uniform banner background and (crucially) the busy artwork below do not spike the same
// way. Returns [y0, y1] rows, or null when no clear band is found (→ caller uses the full
// strip). Excluding the artwork is what lets Tesseract read dark/artwork-heavy cards.
function findTitleBand(luma: Float32Array, w: number, h: number): [number, number] | null {
  const energy = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    for (let x = 1; x < w - 1; x += 1) sum += Math.abs(luma[y * w + x + 1] - luma[y * w + x - 1]);
    energy[y] = sum / w;
  }
  // Light smoothing over rows.
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    let s = 0;
    let n = 0;
    for (let d = -2; d <= 2; d += 1) if (energy[y + d] !== undefined) { s += energy[y + d]; n += 1; }
    sm[y] = s / n;
  }
  // Strongest text row must be in the upper part of the strip (the title sits at the top).
  const searchEnd = Math.floor(h * 0.65);
  let peakY = 0;
  let peak = 0;
  for (let y = 0; y < searchEnd; y += 1) if (sm[y] > peak) { peak = sm[y]; peakY = y; }
  if (peak <= 0) return null;
  const threshold = peak * 0.35;
  let y0 = peakY;
  let y1 = peakY;
  while (y0 > 0 && sm[y0 - 1] >= threshold) y0 -= 1;
  while (y1 < h - 1 && sm[y1 + 1] >= threshold) y1 += 1;
  const pad = Math.round((y1 - y0) * 0.45) + Math.round(h * 0.02);
  y0 = Math.max(0, y0 - pad);
  y1 = Math.min(h - 1, y1 + pad);
  // If the "band" spans most of the strip, detection was inconclusive — bail to full strip.
  if (y1 - y0 >= h * 0.85) return null;
  return [y0, y1];
}

// Crops to the title band (mana cost dropped, artwork excluded), then flattens the horizontal
// glare/shadow gradient by subtracting each column's vertical-mean background and stretches
// the residual contrast — the biggest OCR win on phone photos. The source is already high-res,
// so no upscaling. Returns a grayscale PNG blob Tesseract can read.
function preprocessRegion(strip: OffscreenCanvas, cropWidth: number, y0: number, regionHeight: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(cropWidth, regionHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
  context.drawImage(strip, 0, y0, cropWidth, regionHeight, 0, 0, cropWidth, regionHeight);
  const image = context.getImageData(0, 0, cropWidth, regionHeight);
  const pixels = image.data;
  const luma = new Float32Array(cropWidth * regionHeight);
  lumaOf(pixels, luma);

  // Per-column background: mean luma over the column (within a horizontal smoothing band).
  const smoothBand = Math.max(1, Math.round(cropWidth / 10));
  const background = new Float32Array(cropWidth);
  for (let x = 0; x < cropWidth; x += 1) {
    let sum = 0;
    let count = 0;
    for (let bx = Math.max(0, x - smoothBand); bx <= Math.min(cropWidth - 1, x + smoothBand); bx += 1) {
      for (let y = 0; y < regionHeight; y += 1) {
        sum += luma[y * cropWidth + bx];
        count += 1;
      }
    }
    background[x] = sum / count;
  }

  for (let y = 0, p = 0; y < regionHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1, p += 1) {
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

// Produce the OCR crops: always the full strip (with the mana cost dropped), PLUS — when a
// title band is detected — the isolated band. Feeding both to OCR means band-isolation can
// only help (rescues dark/artwork-heavy cards where the full strip reads garbage) and never
// hurt (the full-strip read is still available), since the caller keeps the best name match.
async function titleCropBlobs(source: CanvasImageSource): Promise<Blob[]> {
  const { width, height } = sourceSize(source);
  const cropWidth = Math.max(1, Math.round(TITLE_REGION.width * width));
  const stripHeight = Math.max(1, Math.round(TITLE_REGION.height * height));

  const strip = new OffscreenCanvas(cropWidth, stripHeight);
  const sctx = strip.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
  sctx.drawImage(source, TITLE_REGION.x * width, TITLE_REGION.y * height, cropWidth, stripHeight, 0, 0, cropWidth, stripHeight);
  const stripLuma = new Float32Array(cropWidth * stripHeight);
  lumaOf(sctx.getImageData(0, 0, cropWidth, stripHeight).data, stripLuma);

  const blobs = [await preprocessRegion(strip, cropWidth, 0, stripHeight)];
  const band = findTitleBand(stripLuma, cropWidth, stripHeight);
  if (band) blobs.push(await preprocessRegion(strip, cropWidth, band[0], band[1] - band[0] + 1));
  return blobs;
}

/** OCR the title of a card from a high-res top-strip image; returns the raw recognized text
 *  (may be multi-line, concatenated across the full strip and the isolated title band — the
 *  caller matches each line against the card-name vocabulary and keeps the best). */
export async function recognizeCardTitle(
  source: CanvasImageSource,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const blobs = await titleCropBlobs(source); // [strip] or [strip, band]
  const worker = await ocrWorker();

  // OCR jobs: the full strip with SINGLE_BLOCK, and — when a band was isolated — the band with
  // BOTH SINGLE_BLOCK and SINGLE_LINE. The two page-segmentation modes are complementary:
  // SINGLE_BLOCK reads a title even with a little residual artwork in the band (Lotus Field),
  // while SINGLE_LINE reads a short lone title in a wide banner that BLOCK drops (Nazgûl). The
  // caller keeps the best name match across all outputs, so both are covered.
  const jobs: Array<{ blob: Blob; psm: PSM }> = [{ blob: blobs[0], psm: PSM.SINGLE_BLOCK }];
  if (blobs[1]) {
    jobs.push({ blob: blobs[1], psm: PSM.SINGLE_BLOCK });
    jobs.push({ blob: blobs[1], psm: PSM.SINGLE_LINE });
  }

  const texts: string[] = [];
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      // Map each job's 0..1 recognize progress onto its slice of the overall pass.
      if (onProgress) recognizeProgress = (fraction) => onProgress((index + fraction) / jobs.length);
      await worker.setParameters({ tessedit_pageseg_mode: job.psm });
      const { data } = await worker.recognize(job.blob);
      texts.push(data.text.trim());
    }
  } finally {
    recognizeProgress = null;
  }
  onProgress?.(1);
  return texts.join("\n");
}
