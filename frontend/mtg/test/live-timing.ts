//! Times the live chain the way it actually runs: one variant per frame, until it would confirm.
//!
//! Per-frame milliseconds are not what a user waits for. What they wait for is the number of
//! frames the design needs before it will confirm, multiplied by what a frame costs on their
//! device. This walks the real `previewFrame` over a photo, frame by frame, and reports both.
//!
//! Usage: node test/live-timing.mjs <photo> [--frames 12] [--width 1080] [--model M] [--model-file F] [--index DIR]
import { join } from "node:path";
import sharp from "sharp";
import { createAgreementTracker, createVariantSelector, previewFrame } from "../src/scanner/live-pipeline";
import type { Embedder } from "../src/scanner/embedder";
import { chosenModel, createNodeEmbedder, indexDir, loadIndex, modelFile, option } from "../scripts/node-scanner";

const photo = process.argv[2];
if (!photo) throw new Error("Aufruf: live-timing.mjs <foto|--labels datei --images ordner>");
const labelFile = option("--labels", "");
const imagesDir = option("--images", "");
const frameCount = Number(option("--frames", "12"));
const width = Number(option("--width", "1080"));

const spec = chosenModel();
const session = await createNodeEmbedder(spec, modelFile(spec), 4);
const index = await loadIndex(indexDir(spec), session);

const embedder: Embedder = {
    model: spec.id,
    backend: "wasm",
    runtime: "node",
    notes: [],
    embed: (image) => session.embed(image),
};

if (labelFile) {
    const { readFile } = await import("node:fs/promises");
    const labels: { file: string; name: string }[] = JSON.parse(await readFile(labelFile, "utf8"));
    let correct = 0;
    let elapsed = 0;
    for (const label of labels) {
        const decoded = await sharp(join(imagesDir, label.file))
            .rotate()
            .resize({ width })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const frame: RgbaImage = {
            data: new Uint8ClampedArray(decoded.data),
            width: decoded.info.width,
            height: decoded.info.height,
        };
        const selector = createVariantSelector();
        let leader = "";
        const started = Date.now();
        for (let pass = 0; pass < 4; pass += 1) {
            const variant = selector.next();
            const result = await previewFrame(frame, index, embedder, variant);
            selector.record(variant, result.sightScore);
            if (result.candidates[0]) leader = result.candidates[0].printing.name;
        }
        elapsed += Date.now() - started;
        const hit = leader.split(" //")[0].toLowerCase() === label.name.split(" //")[0].toLowerCase();
        if (hit) correct += 1;
        process.stdout.write(`  ${hit ? "+" : "-"} ${label.file}  ${leader.slice(0, 30)}\n`);
    }
    process.stdout.write(
        `\n${correct}/${labels.length} führender Kandidat richtig, ${(elapsed / labels.length / 4).toFixed(0)} ms pro Frame\n`,
    );
    process.exit(0);
}

const { data, info } = await sharp(photo).rotate().resize({ width }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
});
const pixels: RgbaImage = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

const agrees = createAgreementTracker();
const variants = createVariantSelector();
let confirmedAt = -1;
let total = 0;

process.stdout.write(`Bild ${info.width}x${info.height}\n`);
for (let frame = 0; frame < frameCount; frame += 1) {
    const started = Date.now();
    const variant = variants.next();
    const preview = await previewFrame(pixels, index, embedder, variant);
    variants.record(variant, preview.candidates[0]?.score ?? 0);
    const elapsed = Date.now() - started;
    total += elapsed;

    const top = preview?.candidates[0];
    const agreed = agrees.seen(top ? top.printing.id : null, top?.score ?? 0, preview.named);
    if (agreed && confirmedAt < 0) confirmedAt = frame;
    process.stdout.write(
        `  Frame ${String(frame).padStart(2)}  V${variant}  ${String(elapsed).padStart(5)} ms  ` +
            `${(top?.printing.name ?? "-").slice(0, 28).padEnd(28)} ` +
            `${top ? top.score.toFixed(3) : "     "}  ${agreed ? "EINIG" : ""}\n`,
    );
}

process.stdout.write(
    `\n${(total / frameCount).toFixed(0)} ms pro Frame im Mittel\n` +
        (confirmedAt < 0
            ? `in ${frameCount} Frames keine Einigkeit\n`
            : `Einigkeit ab Frame ${confirmedAt}, also nach rund ${((total / frameCount) * (confirmedAt + 1)).toFixed(0)} ms\n`),
);
