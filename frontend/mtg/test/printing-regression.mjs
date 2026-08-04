// Shared harness for "correct printing" regression pages. Each case runs a fixture photo
// through the real browser pipeline (bounds detection -> scan signatures -> all-card match)
// and asserts that the top match is the expected printing (set code + collector number).
//
// A regression page is then just:
//   import { runPrintingRegression } from "./printing-regression.mjs";
//   runPrintingRegression([
//     { photo: "./fixtures/some-card.jpg", set: "DSK", number: "408" },
//   ]);
//
// Pass a single object for a one-card page, or an array for a multi-card page (the page
// passes only if every case passes). Set/number comparison is case-insensitive and
// leading-zero tolerant, so "dsk"/"DSK" and "408"/"0408" all match.
import { detectCardBounds } from "../src/imageHash.ts";
import { hybridScan } from "../src/hybridScan.ts";

// Decode exactly like the app's scan worker (createImageBitmap, EXIF-aware) rather than an
// <img> element. Card-edge detection is sensitive to rasterization, so on hard/cluttered
// photos an <img> and an ImageBitmap can detect different bounds — this harness must mirror
// the real runtime path to be representative.
async function loadImage(source) {
  const blob = await (await fetch(source)).blob();
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

function normalize(value) {
  // Strip leading zeros only when a digit follows, so "0408" -> "408" but "GK1-64" stays.
  return String(value).trim().toUpperCase().replace(/^0+(?=\d)/, "");
}

async function runCase({ photo, set, number }) {
  const image = await loadImage(photo);
  const bounds = detectCardBounds(image);
  const { matches, method, ocrText } = await hybridScan(image, 3);
  const best = matches[0];
  const passed = Boolean(
    bounds &&
      best &&
      normalize(best.card.setCode) === normalize(set) &&
      normalize(best.card.collectorNumber) === normalize(number),
  );
  return {
    photo,
    passed,
    expected: `${normalize(set)} #${normalize(number)}`,
    method,
    ocrText,
    boundsDetected: Boolean(bounds),
    matches: matches.map((match) => ({
      card: `${match.card.setCode} #${match.card.collectorNumber}`,
      name: match.card.name,
      similarity: match.similarity,
    })),
    bounds,
  };
}

export async function runPrintingRegression(input) {
  const cases = Array.isArray(input) ? input : [input];
  const result = document.querySelector("#result");
  try {
    const results = [];
    for (const testCase of cases) {
      results.push(await runCase(testCase));
    }
    const passed = results.every((entry) => entry.passed);
    document.body.dataset.status = passed ? "passed" : "failed";
    if (result) result.textContent = JSON.stringify({ passed, results }, null, 2);
  } catch (error) {
    document.body.dataset.status = "failed";
    if (result) result.textContent = String(error);
  }
}
