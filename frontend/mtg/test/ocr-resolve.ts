//! Counts the names a model resolves, not the characters it gets right.
//!
//! `measure-models.sh` used to compare titles exactly. The app never asks that question: it hands
//! the reading to `resolveName`, which matches it against the catalogue by edit distance, so a
//! title one letter out still finds its card. Counting exact matches measures something stricter
//! than the scanner ever decides, and a model can improve where it matters without moving it.
//!
//! Two resolution rates come out, because two different things can go wrong:
//!
//!   * against the shipped index, which is what the app can do today. It holds English and
//!     Japanese printings only, so a German reading has no row to point at however well it was
//!     read, and its rate says nothing about the model.
//!   * against the language's own catalogue, which is what the reader would do once those
//!     printings are appended. That is the number that says whether more training is worth it.
//!
//! Wrong resolutions are counted apart from misses, because they are not the same mistake. A miss
//! costs a frame. A wrong name sends verification after the wrong printings, and since the
//! pipeline skips the model for a resolved name, nothing downstream is left to notice.
//!
//! Usage: node test/ocr-resolve.mjs <pairs-dir>
//!   where <pairs-dir>/<lang>.<model>.tsv holds "truth<TAB>reading" per line.
import { gunzipSync } from "node:zlib";
import { readFile, readdir, access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbeddingIndex, nameKey } from "../src/scanner/embedding-index";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const cacheDir = join(here, "..", ".cache", "scryfall");
const pairsDir = process.argv[2];

/** A catalogue that can be asked what a reading resolves to, and whether that is the right card. */
type Resolver = {
    resolve(text: string): string;
    /**
     * Whether two names are the same card
     *
     * Compared by the rows they reach rather than by the strings, because a printing is filed
     * under both what the catalogue calls it and what is printed on it, and a reading may resolve
     * to either.
     *
     * @param a one name key
     * @param b the other
     * @returns whether any printing carries both
     */
    same(a: string, b: string): boolean;
};

/**
 * Builds a resolver over a list of printings.
 *
 * The vectors are zeroed and never read: only the name half of the index is under test here, and
 * fabricating the buffers is what lets a language be measured before its rows are ever embedded.
 *
 * @param cards the printings, in catalogue shape
 * @param manifest the shipped manifest, for its dimensions
 * @returns the resolver
 */
function resolverFor(
    cards: { i: string; n: string; p?: string }[],
    manifest: { dim: number; sourceDim: number },
): Resolver {
    const index = createEmbeddingIndex({
        manifest: { ...manifest, count: cards.length } as never,
        projection: new Float32Array((manifest.dim + 1) * manifest.sourceDim).buffer,
        vectors: new Int8Array(cards.length * manifest.dim).buffer,
        cards: cards as never,
    });

    const idsByName = new Map<string, Set<string>>();
    for (const card of cards) {
        for (const name of new Set([nameKey(card.n), nameKey(card.p ?? "")])) {
            if (!name) continue;
            const ids = idsByName.get(name);
            if (ids) ids.add(card.i);
            else idsByName.set(name, new Set([card.i]));
        }
    }

    return {
        resolve: (text) => index.resolveName(text),
        same: (a, b) => {
            if (!a || !b) return false;
            if (a === b) return true;
            const left = idsByName.get(a);
            const right = idsByName.get(b);
            if (!left || !right) return false;
            for (const id of left) if (right.has(id)) return true;
            return false;
        },
    };
}

/**
 * Reads a jsonl catalogue of printings into index shape.
 *
 * @param file the jsonl file
 * @returns the printings
 */
async function faces(file: string): Promise<{ i: string; n: string; p?: string }[]> {
    const rows: { i: string; n: string; p?: string }[] = [];
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
        if (!line) continue;
        const card = JSON.parse(line);
        rows.push({ i: card.id, n: card.name, p: card.printedName });
    }
    return rows;
}

const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
const shippedCards = JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8"));
const shipped = resolverFor(shippedCards, manifest);

const files = (await readdir(pairsDir)).filter((name) => name.endsWith(".tsv")).sort();
process.stdout.write(
    `${"Spr".padEnd(5)}${"Modell".padEnd(10)}${"exakt".padEnd(14)}${"Index".padEnd(14)}${"Sprache".padEnd(14)}falsch\n`,
);

for (const file of files) {
    const [lang, model] = file.replace(/\.tsv$/, "").split(".");
    // Every name the language has, not only the printings whose images were fetched. Resolving
    // against a short list is easier than against a long one, and measuring German against 8000
    // names while English faced 135850 made the reader look better in German than it is.
    const names = join(cacheDir, `names-${lang}.jsonl`);
    const catalogue = (await access(names).then(
        () => true,
        () => false,
    ))
        ? names
        : lang === "en"
          ? join(cacheDir, "faces.jsonl")
          : join(cacheDir, `faces-${lang}.jsonl`);
    const local = resolverFor(await faces(catalogue), manifest);

    let total = 0;
    let exact = 0;
    let byIndex = 0;
    let byLanguage = 0;
    let wrong = 0;
    const lines = createInterface({ input: createReadStream(join(pairsDir, file)), crlfDelay: Infinity });
    for await (const line of lines) {
        if (!line) continue;
        const [truth, reading = ""] = line.split("\t");
        total += 1;
        // Spaces compared away, as `resolveName` does: tesseract scatters them freely and the app
        // never counts them either.
        if (reading.replace(/\s/g, "") === truth.replace(/\s/g, "")) exact += 1;

        const answer = local.resolve(reading);
        if (local.same(answer, local.resolve(truth))) byLanguage += 1;
        else if (answer) wrong += 1;

        if (shipped.same(shipped.resolve(reading), shipped.resolve(truth))) byIndex += 1;
    }

    /**
     * Formats a count against the total.
     *
     * @param count how many
     * @returns the padded cell
     */
    const cell = (count: number): string =>
        `${count}/${total} (${total ? Math.round((count * 100) / total) : 0}%)`.padEnd(14);
    process.stdout.write(
        `${lang.padEnd(5)}${model.padEnd(10)}${cell(exact)}${cell(byIndex)}${cell(byLanguage)}${wrong}\n`,
    );
}
