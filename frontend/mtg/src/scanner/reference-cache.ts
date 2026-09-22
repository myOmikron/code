import type { RgbaImage } from "./card-detect";
import type { IndexedPrinting } from "./embedding-index";
import { describeCard, type CardFeatures } from "./feature-verify";
import { loadReferenceImage } from "./reference-images";

/** A reference and its reusable geometric features. */
export type CachedReference = { image: RgbaImage; features: CardFeatures };
// About 41 MiB of decoded pixels, plus descriptors. A long scanning session must not
// retain one 1.3 MB image for every candidate it has ever considered.
const MAX_REFERENCES = 32;
const DOWNLOAD_BUDGET = 2500;
const CONCURRENCY = 3;
const cache = new Map<string, CachedReference>();

/** Load a shortlist with bounded parallel downloads; failures are retried on later frames. */
export async function loadReferences(printings: IndexedPrinting[]): Promise<(CachedReference | null)[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_BUDGET);
    const results: (CachedReference | null)[] = Array(printings.length).fill(null);
    let next = 0;
    try {
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, printings.length) }, async () => {
                while (next < printings.length) {
                    const index = next++;
                    const printing = printings[index];
                    const key = `${printing.id}/${printing.face}`;
                    const known = cache.get(key);
                    if (known) {
                        cache.delete(key);
                        cache.set(key, known);
                        results[index] = known;
                        continue;
                    }
                    if (controller.signal.aborted) continue;
                    const image = await loadReferenceImage(printing.id, printing.face, controller.signal);
                    if (!image) continue;
                    const entry = { image, features: await describeCard(image) };
                    cache.set(key, entry);
                    while (cache.size > MAX_REFERENCES) cache.delete(cache.keys().next().value!);
                    results[index] = entry;
                }
            }),
        );
        return results;
    } finally {
        clearTimeout(timer);
    }
}
