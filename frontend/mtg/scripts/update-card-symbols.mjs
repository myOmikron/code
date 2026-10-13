// Refresh the checked-in symbols; normal builds require no Scryfall access.
// Source: https://scryfall.com/docs/api/card-symbols
import { mkdir, writeFile } from "node:fs/promises";

const directory = new URL("../public/card-symbols/", import.meta.url);
const headers = { "User-Agent": "Planarium/1.0 (https://planarium.app)", Accept: "application/json" };
const response = await fetch("https://api.scryfall.com/symbology", { headers });
if (!response.ok) throw new Error(`Symbol catalog: HTTP ${response.status}`);
const { data } = await response.json();
await mkdir(directory, { recursive: true });
let count = 0;
for (const { svg_uri } of data) {
    if (!svg_uri) continue;
    const url = new URL(svg_uri);
    const filename = url.pathname.split("/").pop();
    if (url.origin !== "https://svgs.scryfall.io" || !/^[A-Z0-9]+\.svg$/.test(filename)) {
        throw new Error(`Unexpected symbol URL: ${svg_uri}`);
    }
    const image = await fetch(url, { headers: { ...headers, Accept: "image/svg+xml" } });
    if (!image.ok) throw new Error(`${filename}: HTTP ${image.status}`);
    const svg = await image.text();
    if (!svg.includes("<svg")) throw new Error(`${filename}: expected SVG`);
    await writeFile(new URL(filename, directory), svg);
    count++;
}
console.log(`Updated ${count} card symbols.`);
