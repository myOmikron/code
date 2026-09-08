//! Dumps the intermediate maps detection works on for a single photo.
//!
//! Reporting that a photo failed says nothing about why. This writes the Otsu binarisation and
//! every Canny map to disk so the failure can be attributed to the segmentation rather than
//! guessed at from the scoring.
//!
//! Usage: node test/detect-debug.mjs <image>
import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadOpenCv, withMats } from "../src/scanner/opencv";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, "detect-output", "debug");

const input = process.argv[2];
if (!input) throw new Error("Bildpfad fehlt");
const stem = basename(input, extname(input));

const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

const cv = await loadOpenCv();
await mkdir(outputDir, { recursive: true });

const workingSize = 720;
const scale = Math.min(1, workingSize / Math.max(pixels.width, pixels.height));
const workWidth = Math.round(pixels.width * scale);
const workHeight = Math.round(pixels.height * scale);

/**
 * Writes a single-channel Mat as a PNG
 *
 * @param mat
 * @param name
 */
async function dump(mat: { data: Uint8Array }, name: string): Promise<void> {
    await sharp(Buffer.from(mat.data), { raw: { width: workWidth, height: workHeight, channels: 1 } })
        .png()
        .toFile(join(outputDir, `${stem}-${name}.png`));
}

const maps = withMats((track) => {
    const full = track(cv.matFromImageData(pixels));
    const rgba = track(new cv.Mat());
    cv.resize(full, rgba, new cv.Size(workWidth, workHeight), 0, 0, cv.INTER_AREA);
    const gray = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const binary = track(new cv.Mat());
    const otsu = cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);

    const out: { name: string; data: Uint8Array }[] = [
        { name: "gray", data: new Uint8Array(gray.data) },
        { name: `binary-otsu${Math.round(otsu)}`, data: new Uint8Array(binary.data) },
    ];
    for (const factor of [0.6, 1, 1.6]) {
        const edges = track(new cv.Mat());
        cv.Canny(blurred, edges, Math.max(10, otsu * factor * 0.5), Math.max(30, otsu * factor));
        cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
        out.push({ name: `canny-${factor}`, data: new Uint8Array(edges.data) });
    }
    process.stdout.write(`otsu ${otsu.toFixed(1)}  arbeitsgröße ${workWidth}×${workHeight}\n`);
    return out;
});

for (const map of maps) await dump(map, map.name);
process.stdout.write(`${maps.length} Karten geschrieben nach ${outputDir}\n`);
