//! End-to-end recognition with local-feature verification, measured against a known decklist.
//!
//! The embedding narrows 111k printings to a shortlist; ORB features with a homography decide
//! among them. The shortlist is deliberately generous, because a candidate the embedding never
//! proposes can never be verified, and generosity there is cheap while a wrong final answer is
//! not.
//!
//! ORB is rotation invariant, so the four orientations only matter for building the shortlist.
//! Verification runs on the unrotated crops.
//!
//! Usage: node test/verify-harness.mjs <photoDir> <decklist> [--candidates 20] [--crops 2]
import { gunzipSync } from "node:zlib";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp from "sharp";
import { detectCardsIn, rectifyCardIn, shrinkQuad } from "../src/scanner/card-detect";
import type { RgbaImage } from "../src/scanner/card-detect";
import { IMAGE_SIZE, poolHidden, prepareForModel } from "../src/scanner/embedding";
import { createEmbeddingIndex } from "../src/scanner/embedding-index";
import { describeCard, discriminatePrintings, verifyAgainst } from "../src/scanner/feature-verify";
import { MIN_ACCEPT_INLIERS } from "../src/scanner/scan-decision";
import type { CardFeatures } from "../src/scanner/feature-verify";

const here = dirname(fileURLToPath(import.meta.url));
const indexDir = join(here, "..", "public", "data", "scan-index");
const cacheDir = join(here, "..", ".cache", "scryfall");
const modelPath = join(here, "..", ".cache", "models", "model.onnx");

/** Trim fractions tried per quad, covering an unsleeved card and common sleeve thicknesses. */
const INSETS = [0, 0.04];
function option(flag: string, fallback: string): string {
    const index = process.argv.indexOf(flag);
    return index === -1 ? fallback : process.argv[index + 1];
}

const [photoDir, truthPath] = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const candidateCount = Number(option("--candidates", "20"));
const cropCount = Number(option("--crops", "2"));
/** Skip verification and only report how deep the shortlist must go to contain the card. */
const recallOnly = process.argv.includes("--recall-only");
/**
 * Replaces the embedding shortlist with the decklist itself, which measures what detection and
 * verification achieve on their own. Any gap to 100 is theirs; the rest is the retrieval stage.
 */
const oracleShortlist = process.argv.includes("--oracle");
/**
 * How many of the shortlist's leading names get all their printings pulled in.
 *
 * The embedding ranks by overall appearance, which is exactly what cannot separate two printings
 * of one card that share an illustration. Once it has produced the right *name*, every printing
 * under that name is a candidate worth verifying.
 *
 * Measured on the Goblin Storm deck this changed printing accuracy by one photo out of a hundred
 * and cost a second per photo, so it is off by default: the candidates were never the shortage.
 * What the remaining errors need is resolution, not more candidates.
 */
const expandNames = Number(option("--expand-names", "0"));
/** Upper bound on candidates after expansion, so a basic land does not pull in six hundred. */
const maxCandidates = Number(option("--max-candidates", "150"));
/**
 * Share of the best inlier count a candidate must still reach to count as tied with it.
 *
 * A List reprint and the printing it reprints are the same picture, so their inlier counts land
 * within a few percent of each other and the ranking between them is noise. Everything inside
 * this band goes to the discriminator instead.
 */
const TIE_RATIO = 0.95;
/** Skip the discriminator below this many inliers; nothing there is a confident match anyway. */
const MIN_TIE_INLIERS = 40;
/** Writes one row per photo with the winning inlier count and whether it was right. */
const dumpPath = option("--dump", "");
const RECALL_DEPTHS = [1, 5, 20, 50, 100, 250, 500];
/** How deep each crop's own search goes before results are pooled. */
const perCropDepth = recallOnly ? 64 : 8;

async function readImage(path: string, rotate = false): Promise<RgbaImage> {
    const pipeline = rotate ? sharp(path).rotate() : sharp(path);
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function main(): Promise<void> {
    // Two ways to know the answer, and they measure different things. A decklist can only say
    // "somewhere in this deck", which counts any of three near-identical basic lands as right.
    // Per-photo labels say which card is in *this* picture, so every number below becomes exact.
    const truth = await readFile(truthPath, "utf8");
    const labelled = truthPath.endsWith(".json");
    const labels = new Map<string, Label>();
    const wanted = new Set<string>();
    const wantedNames = new Set<string>();

    if (labelled) {
        for (const label of JSON.parse(truth) as Label[]) {
            if (label.status !== "ok" || !label.name) continue;
            labels.set(label.file, label);
            wanted.add(`${(label.set ?? "").toLowerCase()}/${(label.number ?? "").toUpperCase()}`);
            wantedNames.add(label.name.split(" //")[0].toLowerCase());
        }
    } else {
        for (const line of truth.split("\n")) {
            if (/^sideboard\b/i.test(line.trim())) break;
            const match = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+?)(\s+\*F\*)?\s*$/.exec(line.trim());
            if (!match) continue;
            wanted.add(`${match[3].toLowerCase()}/${match[4].toUpperCase()}`);
            wantedNames.add(match[2].split(" //")[0].toLowerCase());
        }
    }

    const manifest = JSON.parse(await readFile(join(indexDir, "manifest.json"), "utf8"));
    const index = createEmbeddingIndex({
        manifest,
        projection: (await readFile(join(indexDir, "projection.f32"))).buffer as ArrayBuffer,
        vectors: (await readFile(join(indexDir, "vectors.i8"))).buffer as ArrayBuffer,
        cards: JSON.parse(gunzipSync(await readFile(join(indexDir, "cards.json.gz"))).toString("utf8")),
    });

    const imagePaths = new Map<string, string>();
    const byName = new Map<string, [string, { score: number; name: string; set: string; number: string }][]>();
    const oracle: [string, { score: number; name: string; set: string; number: string }][] = [];
    const lines = createInterface({ input: createReadStream(join(cacheDir, "faces.jsonl")), crlfDelay: Infinity });
    for await (const line of lines) {
        if (!line) continue;
        const face = JSON.parse(line);
        const key = `${face.id}/${face.face}`;
        imagePaths.set(key, face.image);
        const normalized = face.name.split(" //")[0].toLowerCase();
        const entry: [string, { score: number; name: string; set: string; number: string }] = [
            key,
            { score: 0, name: face.name, set: face.set, number: face.collectorNumber },
        ];
        const existing = byName.get(normalized);
        if (existing) existing.push(entry);
        else byName.set(normalized, [entry]);
        if (wanted.has(`${face.set}/${face.collectorNumber.toUpperCase()}`)) {
            oracle.push([key, { score: 0, name: face.name, set: face.set, number: face.collectorNumber }]);
        }
    }
    if (oracleShortlist) process.stdout.write(`Orakel-Shortlist: ${oracle.length} Drucke\n`);

    const session = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: 12 });
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const embed = async (image: RgbaImage): Promise<Float32Array> => {
        const output = await session.run({
            [inputName]: new ort.Tensor("float32", await prepareForModel(image), [1, 3, IMAGE_SIZE, IMAGE_SIZE]),
        });
        const tensor = output[outputName];
        return poolHidden(tensor.data as Float32Array, 1, tensor.dims[1] as number)[0];
    };

    const referenceFeatures = new Map<string, CardFeatures>();
    const referenceImages = new Map<string, RgbaImage>();
    const loadReference = async (key: string): Promise<RgbaImage | null> => {
        const cached = referenceImages.get(key);
        if (cached) return cached;
        const relative = imagePaths.get(key);
        if (!relative) return null;
        const image = await readImage(join(cacheDir, relative));
        referenceImages.set(key, image);
        return image;
    };
    const describeReference = async (key: string): Promise<CardFeatures | null> => {
        const cached = referenceFeatures.get(key);
        if (cached) return cached;
        const image = await loadReference(key);
        if (!image) return null;
        const features = await describeCard(image);
        referenceFeatures.set(key, features);
        return features;
    };

    const allFiles = (await readdir(photoDir))
        .filter((file) => [".jpg", ".jpeg", ".png"].includes(extname(file).toLowerCase()))
        .sort();
    const files = labelled ? allFiles.filter((file) => labels.has(file)) : allFiles;
    const excluded = allFiles.length - files.length;
    process.stdout.write(
        `${files.length} Fotos${excluded ? ` (${excluded} ohne brauchbares Label übersprungen)` : ""}, ` +
            `Wahrheit: ${labelled ? "Labels pro Foto" : "Deckliste"}, Shortlist ${candidateCount}\n\n`,
    );

    let nameHits = 0;
    let printingHits = 0;
    let embeddingNameHits = 0;
    let shortlistHits = 0;
    let discriminated = 0;
    let noDetection = 0;
    let offered = 0;
    let declined = 0;
    let declinedCorrect = 0;
    const recallCounts = new Map<number, number>();
    const poolSizes: number[] = [];
    const foundPrintings = new Set<string>();
    const failures: string[] = [];
    const rows: string[] = [];
    const printingMisses: string[] = [];
    const started = Date.now();

    for (const file of files) {
        const pixels = await readImage(join(photoDir, file), true);
        const cards = await detectCardsIn(pixels);
        if (cards.length === 0) {
            const label = labels.get(file);
            failures.push(`${file}  keine Detektion${label ? `  erwartet: ${label.name}` : ""}`);
            noDetection += 1;
            continue;
        }

        const crops: { image: RgbaImage; score: number }[] = [];
        const pool = new Map<string, { score: number; name: string; set: string; number: string }>();

        for (const card of cards.slice(0, 2)) {
            for (const inset of INSETS) {
                const quad = inset === 0 ? card.quad : shrinkQuad(card.quad, inset);
                const upright = await rectifyCardIn(pixels, quad, 0);
                let bestForCrop = -Infinity;
                for (let rotation = 0; rotation < 4; rotation += 1) {
                    const rectified = rotation === 0 ? upright : await rectifyCardIn(pixels, quad, rotation);
                    for (const match of index.search(index.project(await embed(rectified)), perCropDepth)) {
                        const key = `${match.printing.id}/${match.printing.face}`;
                        const existing = pool.get(key);
                        if (!existing || match.score > existing.score) {
                            pool.set(key, {
                                score: match.score,
                                name: match.printing.name,
                                set: match.printing.set,
                                number: match.printing.collectorNumber,
                            });
                        }
                        bestForCrop = Math.max(bestForCrop, match.score);
                    }
                }
                crops.push({ image: upright, score: bestForCrop });
            }
        }
        if (crops.length === 0) continue;

        const ranked = [...pool.entries()].sort((a, b) => b[1].score - a[1].score);
        if (recallOnly) {
            const rank = ranked.findIndex(([, entry]) => wantedNames.has(entry.name.split(" //")[0].toLowerCase()));
            for (const depth of RECALL_DEPTHS) {
                if (rank >= 0 && rank < depth) recallCounts.set(depth, (recallCounts.get(depth) ?? 0) + 1);
            }
            poolSizes.push(ranked.length);
            continue;
        }
        let shortlist = oracleShortlist ? oracle : ranked.slice(0, candidateCount);
        if (!oracleShortlist && expandNames > 0) {
            const chosen = new Map(shortlist);
            const names: string[] = [];
            for (const [, entry] of ranked) {
                const normalized = entry.name.split(" //")[0].toLowerCase();
                if (!names.includes(normalized)) names.push(normalized);
                if (names.length >= expandNames) break;
            }
            for (const name of names) {
                for (const [key, entry] of byName.get(name) ?? []) {
                    if (chosen.size >= maxCandidates) break;
                    if (!chosen.has(key)) chosen.set(key, entry);
                }
            }
            shortlist = [...chosen.entries()];
        }
        const isExpected = (candidateName: string) => {
            const normalised = candidateName.split(" //")[0].toLowerCase();
            const expectedLabel = labels.get(file)?.name?.split(" //")[0].toLowerCase();
            return labelled ? normalised === expectedLabel : wantedNames.has(normalised);
        };
        if (shortlist.length && isExpected(shortlist[0][1].name)) embeddingNameHits += 1;
        if (shortlist.some(([, entry]) => isExpected(entry.name))) shortlistHits += 1;

        crops.sort((a, b) => b.score - a.score);
        const queries: CardFeatures[] = [];
        const queryImages: RgbaImage[] = [];
        for (const crop of crops.slice(0, cropCount)) {
            queries.push(await describeCard(crop.image));
            queryImages.push(crop.image);
        }

        const verified: {
            key: string;
            inliers: number;
            entry: (typeof shortlist)[0][1];
            homography: number[] | null;
            queryIndex: number;
        }[] = [];
        for (const [key, entry] of shortlist) {
            const reference = await describeReference(key);
            if (!reference) continue;
            let inliers = 0;
            let homography: number[] | null = null;
            let queryIndex = 0;
            for (const [index, query] of queries.entries()) {
                const result = await verifyAgainst(query, reference);
                if (result.inliers > inliers) {
                    inliers = result.inliers;
                    homography = result.homography;
                    queryIndex = index;
                }
            }
            verified.push({ key, inliers, entry, homography, queryIndex });
        }
        verified.sort((a, b) => b.inliers - a.inliers);
        let best = verified[0] ?? null;
        if (!best) continue;

        const tied = verified.filter(
            (candidate) =>
                candidate.inliers >= MIN_TIE_INLIERS &&
                candidate.inliers >= best!.inliers * TIE_RATIO &&
                candidate.homography !== null,
        );
        if (tied.length > 1) {
            const references = await Promise.all(tied.map((candidate) => loadReference(candidate.key)));
            const usable = tied
                .map((candidate, index) => ({ candidate, reference: references[index] }))
                .filter((pair): pair is { candidate: (typeof tied)[0]; reference: RgbaImage } => pair.reference !== null);
            if (usable.length > 1) {
                const decision = await discriminatePrintings(
                    queryImages[usable[0].candidate.queryIndex],
                    usable.map((pair) => ({ reference: pair.reference, homography: pair.candidate.homography! })),
                );
                if (decision) {
                    best = usable[decision.index].candidate;
                    discriminated += 1;
                }
            }
        }

        const name = best.entry.name.split(" //")[0].toLowerCase();
        const printing = `${best.entry.set}/${best.entry.number.toUpperCase()}`;
        const label = labels.get(file);
        const expectedName = label?.name?.split(" //")[0].toLowerCase();
        const expected = `${(label?.set ?? "").toLowerCase()}/${(label?.number ?? "").toUpperCase()}`;
        const nameRight = labelled ? name === expectedName : wantedNames.has(name);
        const printingRight = labelled ? printing === expected : wanted.has(printing);

        rows.push(`${file}\t${best.inliers}\t${nameRight ? 1 : 0}\t${printingRight ? 1 : 0}`);

        // The scanner would refuse below the threshold rather than offer this, so it is neither
        // a hit nor a miss: it is a card the user is asked to hold still for once more.
        if (best.inliers < MIN_ACCEPT_INLIERS) {
            declined += 1;
            if (nameRight) declinedCorrect += 1;
            continue;
        }
        offered += 1;
        if (nameRight) nameHits += 1;
        else
            failures.push(
                `${file}  -> ${best.entry.name} (${best.entry.set.toUpperCase()}) ${best.entry.number}  ` +
                    `inliers ${best.inliers}${label ? `  erwartet: ${label.name} (${(label.set ?? "").toUpperCase()}) ${label.number}` : ""}`,
            );
        if (printingRight) {
            printingHits += 1;
            foundPrintings.add(printing);
        } else if (nameRight) {
            const alternatives = shortlist.filter(
                ([, entry]) => entry.name.split(" //")[0].toLowerCase() === name,
            ).length;
            printingMisses.push(
                `${file}  ${best.entry.name} -> gewählt (${best.entry.set.toUpperCase()}) ${best.entry.number}` +
                    `${label ? `, erwartet (${(label.set ?? "").toUpperCase()}) ${label.number}` : ""}` +
                    `, ${alternatives} Drucke dieses Namens in der Shortlist, inliers ${best.inliers}`,
            );
        }
    }

    if (dumpPath) await writeFile(dumpPath, `${rows.join("\n")}\n`, "utf8");
    const elapsed = (Date.now() - started) / 1000;
    if (recallOnly) {
        const average = poolSizes.reduce((sum, value) => sum + value, 0) / Math.max(poolSizes.length, 1);
        process.stdout.write(`Kandidatenpool im Mittel ${average.toFixed(0)} Einträge\n`);
        for (const depth of RECALL_DEPTHS) {
            process.stdout.write(`recall@${String(depth).padStart(3)}  ${recallCounts.get(depth) ?? 0}/${files.length}\n`);
        }
        process.stdout.write(`${(elapsed / Math.max(files.length, 1)).toFixed(2)} s pro Foto\n`);
        return;
    }
    process.stdout.write(
        `nur Embedding, Name        ${embeddingNameHits}/${files.length}\n` +
            `Shortlist enthält Karte    ${shortlistHits}/${files.length}\n` +
            `ohne Detektion             ${noDetection}/${files.length}\n` +
            `abgelehnt (<${MIN_ACCEPT_INLIERS} Inliers)     ${declined}/${files.length}` +
            `${declinedCorrect ? `  davon wären ${declinedCorrect} richtig gewesen` : ""}\n` +
            `beantwortet                ${offered}/${files.length}\n` +
            `davon Name richtig         ${nameHits}/${offered || 1}\n` +
            `davon Druck richtig        ${printingHits}/${offered || 1}\n` +
            `davon per Maske entschieden ${discriminated}\n` +
            `${labelled ? "verschiedene Drucke richtig" : "Deck-Drucke abgedeckt     "}  ${foundPrintings.size}/${wanted.size}\n` +
            `${(elapsed / Math.max(files.length, 1)).toFixed(2)} s pro Foto\n`,
    );
    if (printingMisses.length) {
        process.stdout.write(`\nName richtig, Druck falsch (${printingMisses.length}):\n`);
        for (const miss of printingMisses.slice(0, 25)) process.stdout.write(`  ${miss}\n`);
    }
    if (failures.length) {
        process.stdout.write(`\nFehlschläge (${failures.length}):\n`);
        for (const failure of failures.slice(0, 40)) process.stdout.write(`  ${failure}\n`);
    }
}

await main();
