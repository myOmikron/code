// test/plst-probe.ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
var here = dirname(fileURLToPath(import.meta.url));
var cacheDir = join(here, "..", ".cache", "scryfall");
var faces = [];
var lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
for await (const line of lines) if (line) faces.push(JSON.parse(line));
var pairs = [
  ["MH3-295", "mh3/295"],
  ["MM3-105", "mm3/105"],
  ["TSR-169", "tsr/169"],
  ["OTC-181", "otc/181"],
  ["WOE-158", "woe/158"]
];
for (const [listNumber, original] of pairs) {
  const [set, number] = original.split("/");
  const listed = faces.find((f) => f.set === "plst" && f.collectorNumber.toUpperCase() === listNumber);
  const source = faces.find((f) => f.set === set && f.collectorNumber === number);
  if (!listed || !source) {
    console.log(`${listNumber}: nicht gefunden`);
    continue;
  }
  const read = (face) => sharp(join(cacheDir, face.image)).resize(488, 680, { fit: "fill" }).greyscale().raw().toBuffer();
  const [a, b] = await Promise.all([read(listed), read(source)]);
  let minX = 488;
  let maxX = 0;
  let minY = 680;
  let maxY = 0;
  let differing = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) <= 30) continue;
    differing += 1;
    const x = i % 488;
    const y = Math.floor(i / 488);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  console.log(
    `${listNumber.padEnd(9)} ${listed.name.slice(0, 18).padEnd(19)} ${String(differing).padStart(4)} px  x ${(minX / 488).toFixed(3)}-${(maxX / 488).toFixed(3)}  y ${(minY / 680).toFixed(3)}-${(maxY / 680).toFixed(3)}`
  );
}
//! Compares a List printing's reference image with the original it reprints.
//!
//! Answers whether the difference is even present in the reference material: if Scryfall's List
//! scan is the same image as the original's, no amount of work on the query side can separate
//! them, and the distinction has to come from somewhere other than the picture.
