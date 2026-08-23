//! Checks whether local features separate the right printing from wrong ones at all.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describeCard, verifyAgainst } from "../src/scanner/feature-verify";
import type { RgbaImage } from "../src/scanner/card-detect";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const [cropPath, wantSet, wantNumber] = process.argv.slice(2);

async function read(path: string): Promise<RgbaImage> {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

const faces: { image: string; name: string; set: string; collectorNumber: string }[] = [];
const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));

const target = faces.find((f) => f.set === wantSet && f.collectorNumber.toUpperCase() === wantNumber.toUpperCase())!;
const sameName = faces.filter((f) => f.name === target.name && f !== target).slice(0, 4);
const others = [0, 20000, 45000, 70000, 95000].map((i) => faces[i]);

const query = await describeCard(await read(cropPath));
console.log(`Anfrage: ${query.count} Keypoints\n`);

for (const [label, face] of [
    ["RICHTIG   ", target],
    ...sameName.map((f) => ["Reprint   ", f] as const),
    ...others.map((f) => ["fremd     ", f] as const),
] as [string, typeof target][]) {
    const reference = await describeCard(await read(join(cacheDir, face.image)));
    const result = await verifyAgainst(query, reference);
    console.log(
        `${label} ${face.name.slice(0, 24).padEnd(25)} (${face.set.toUpperCase().padEnd(4)}) ${face.collectorNumber.padEnd(8)} ` +
            `kp ${String(reference.count).padStart(3)}  matches ${String(result.matches).padStart(3)}  ` +
            `inliers ${String(result.inliers).padStart(3)}  ratio ${result.ratio.toFixed(3)}`,
    );
}
