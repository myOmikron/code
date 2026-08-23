// Composes the harness output into one contact sheet, so 30 detections can be judged at a
// glance instead of opened one by one. Pass "overlay" (default) or "rectified".
// Usage: node test/detect-sheet.mjs [overlay|rectified]
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const directory = "test/detect-output";
const kind = process.argv[2] ?? "overlay";
const columns = 6;
const tileWidth = 200;
const tileHeight = 300;

const files = (await readdir(directory)).filter((file) => file.endsWith(`-${kind}.jpg`)).sort();
const rows = Math.ceil(files.length / columns);
const tiles = [];
for (const [index, file] of files.entries()) {
  tiles.push({
    input: await sharp(join(directory, file))
      .resize(tileWidth, tileHeight, { fit: "contain", background: "#111" })
      .toBuffer(),
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  });
}
await sharp({
  create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: "#111" },
})
  .composite(tiles)
  .jpeg({ quality: 80 })
  .toFile(join(directory, `_sheet-${kind}.jpg`));
console.log(files.map((file, index) => `${index}:${file.replace(`-${kind}.jpg`, "")}`).join("  "));
