//! Downloads reference images for non-English printings, to train the reader on their scripts.
//!
//! The card catalogue this project already caches is the `default_cards` export: one printing per
//! card, which is English by construction and leaves 589 usable Japanese images. `all_cards` has
//! 53,342 — enough to fine-tune on, where 589 was not.
//!
//! Capped per language rather than exhaustive. All 341,555 non-English images would be some 34 GB
//! and the training needs a fraction of that; the cap is what keeps this a download rather than a
//! commitment.
//!
//! Scryfall's rate limit of ten requests a second applies to `api.scryfall.com`. Images come from
//! `cards.scryfall.io`, which their documentation explicitly exempts, so the constraint here is
//! the connection rather than the service. The User-Agent is still ours and named, as they ask.
//!
//! Writes a work list rather than downloading: node's DNS resolver does not reach
//! `cards.scryfall.io` from this development sandbox while curl does, so the fetching is left to
//! curl and this decides only what to fetch. `scripts/fetch-language-images.sh` runs both halves.
//!
//! Usage: node scripts/fetch-language-images.mjs --lang ja [--count 25000] > liste.txt
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", ".cache", "scryfall");
const imagesDir = join(cacheDir, "images");

function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const language = option("--lang", "ja");
const wanted = Number(option("--count", "25000"));

/** A printing worth downloading: it has a real image and a name printed on it. */
type Wanted = { id: string; url: string; name: string; printedName: string; set: string; collectorNumber: string };

const targets: Wanted[] = [];
const lines = createInterface({
    input: createReadStream(join(cacheDir, "all-cards.jsonl.gz")).pipe(createGunzip()),
    crlfDelay: Infinity,
});

for await (const line of lines) {
    if (!line || targets.length >= wanted) continue;
    const card = JSON.parse(line);
    if (card.lang !== language) continue;
    // A placeholder is the English artwork with "Localized Image Not Available" printed across
    // it. Training on one would pair a Japanese name with Latin lettering.
    if (card.image_status !== "highres_scan" && card.image_status !== "lowres") continue;
    const url: string | undefined = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
    if (!url) continue;
    targets.push({
        id: card.id,
        url,
        name: card.name,
        printedName: card.printed_name ?? card.card_faces?.[0]?.printed_name ?? card.name,
        set: card.set,
        collectorNumber: card.collector_number,
    });
}

process.stderr.write(`${targets.length} Drucke in "${language}"\n`);

/**
 * Where an image belongs, matching the layout the English cache already uses
 *
 * @param id the printing's scryfall id
 * @returns an absolute path
 */
function imagePath(id: string): string {
    return join(imagesDir, id.slice(0, 2), `${id}_0.jpg`);
}

/**
 * Where an image belongs on disk, and where to get it, as one tab-separated line each
 */
/**
 * Whether a cached image is complete, not merely present.
 *
 * Every jpeg ends in ffd9. A transfer cut short leaves a file that exists, and existence was the
 * whole test here, so the download was never retried and the truncation reached the index as a
 * vector of whatever the partial image decodes to. Two runs were interrupted before this was here.
 *
 * @param path the cached file
 * @returns whether it can be trusted
 */
async function complete(path: string): Promise<boolean> {
    const handle = await open(path, "r").catch(() => null);
    if (!handle) return false;
    try {
        const size = (await handle.stat()).size;
        if (size < 4) return false;
        const tail = Buffer.alloc(2);
        await handle.read(tail, 0, 2, size - 2);
        return tail[0] === 0xff && tail[1] === 0xd9;
    } finally {
        await handle.close();
    }
}

const work: string[] = [];
let present = 0;
let angebrochen = 0;
for (const target of targets) {
    const path = imagePath(target.id);
    if (await stat(path).catch(() => null)) {
        if (await complete(path)) {
            present += 1;
            continue;
        }
        await rm(path, { force: true });
        angebrochen += 1;
    }
    await mkdir(dirname(path), { recursive: true });
    work.push(`${target.url}\t${path}`);
}
process.stdout.write(`${work.join("\n")}\n`);

// The catalogue of what was fetched, in the same shape the corpus builder reads for English.
const facesPath = join(cacheDir, `faces-${language}.jsonl`);
await writeFile(
    facesPath,
    `${targets
        .map((target) =>
            JSON.stringify({
                id: target.id,
                name: target.name,
                printedName: target.printedName,
                lang: language,
                set: target.set,
                collectorNumber: target.collectorNumber,
                face: 0,
                image: `images/${target.id.slice(0, 2)}/${target.id}_0.jpg`,
            }),
        )
        .join("\n")}\n`,
    "utf8",
);

process.stderr.write(
    `${work.length} zu laden, ${present} vorhanden` +
        `${angebrochen ? `, ${angebrochen} angebrochene entfernt` : ""}. Katalog: ${facesPath}\n`,
);
