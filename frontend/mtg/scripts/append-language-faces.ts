//! Adds one language's printings to the catalogue the embedding index is built from.
//!
//! The index holds English printings only, so a Japanese title that the reader gets right has no
//! card to point at. Appending rather than rebuilding is what makes this affordable: the vector
//! file is written in catalogue order and the builder resumes behind whatever is already on disk,
//! so only the new rows are embedded — twenty minutes instead of an hour.
//!
//! Append order therefore matters more than it looks. Anything that reorders or removes existing
//! lines silently pairs every vector with the wrong card.
//!
//! Usage: node scripts/append-language-faces.mjs --lang ja
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { appendFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const language = option("--lang", "ja");
const facesPath = join(cacheDir, "faces.jsonl");

const already = new Set<string>();
const existing = createInterface({ input: createReadStream(facesPath), crlfDelay: Infinity });
for await (const line of existing) {
    if (line) already.add(JSON.parse(line).id);
}
process.stderr.write(`${already.size} Drucke bereits im Katalog\n`);

/**
 * Everything the index builder and packer read about one face.
 *
 * Built from the bulk record rather than from the fetcher's catalogue, which carries only what
 * the download needed. `printedName` is the addition: the packer writes it alongside the English
 * name so a reading in either can be resolved to the same card.
 */
type Face = Record<string, unknown>;

const additions: Face[] = [];
const bulk = createInterface({
    input: createReadStream(join(cacheDir, "all-cards.jsonl.gz")).pipe(createGunzip()),
    crlfDelay: Infinity,
});

for await (const line of bulk) {
    if (!line) continue;
    const card = JSON.parse(line);
    if (card.lang !== language || already.has(card.id)) continue;
    if (card.image_status !== "highres_scan" && card.image_status !== "lowres") continue;

    const image = `images/${card.id.slice(0, 2)}/${card.id}_0.jpg`;
    // Only what was actually downloaded. A missing file would be embedded as zeros, and a zero
    // vector sits equally close to every card in the index.
    if (!(await stat(join(cacheDir, image)).catch(() => null))) continue;

    const front = card.card_faces?.[0] ?? card;
    additions.push({
        id: card.id,
        oracleId: card.oracle_id,
        set: card.set,
        setName: card.set_name,
        setType: card.set_type,
        collectorNumber: card.collector_number,
        lang: card.lang,
        layout: card.layout,
        rarity: card.rarity,
        frame: card.frame,
        frameEffects: card.frame_effects ?? [],
        borderColor: card.border_color,
        fullArt: card.full_art ?? false,
        textless: card.textless ?? false,
        promo: card.promo ?? false,
        promoTypes: card.promo_types ?? [],
        finishes: card.finishes ?? [],
        releasedAt: card.released_at,
        digital: card.digital ?? false,
        manaCost: front.mana_cost ?? "",
        typeLine: front.type_line ?? card.type_line ?? "",
        colors: front.colors ?? card.colors ?? [],
        face: 0,
        name: card.name,
        printedName: card.printed_name ?? front.printed_name ?? "",
        illustrationId: front.illustration_id ?? "",
        artist: card.artist ?? "",
        image,
    });
}

if (additions.length === 0) {
    process.stderr.write("nichts anzuhängen\n");
} else {
    await appendFile(facesPath, `${additions.map((face) => JSON.stringify(face)).join("\n")}\n`, "utf8");
    process.stderr.write(
        `${additions.length} Drucke in "${language}" angehängt, Katalog jetzt ${already.size + additions.length}\n` +
            `Weiter mit: pnpm run scan:embed  (setzt hinter den vorhandenen Vektoren fort)\n`,
    );
}
