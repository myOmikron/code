//! Lists every quad detection considered for one photo, with its score and where it sits.
//!
//! A wrong detection is not a missing one. When the outline lands on the background, the question
//! is whether the correct quad was never found or was found and outranked, and only the full
//! candidate list answers it.
//!
//! Usage: node test/candidate-list.mjs <image>
import sharp from "sharp";
import { detectCardsIn } from "../src/scanner/card-detect";
import type { DetectedCard, RgbaImage } from "../src/scanner/card-detect";

const input = process.argv[2];
if (!input) throw new Error("Bildpfad fehlt");

const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels: RgbaImage = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

const seen: Record<string, DetectedCard[]> = {};
await detectCardsIn(pixels, { onCandidates: (candidates, source) => (seen[source] = candidates) });

for (const [source, candidates] of Object.entries(seen)) {
    process.stdout.write(`\n${source}: ${candidates.length}\n`);
    for (const [rank, card] of candidates.slice(0, 12).entries()) {
        const xs = [card.quad.topLeft, card.quad.topRight, card.quad.bottomRight, card.quad.bottomLeft];
        const centreX = xs.reduce((sum, p) => sum + p.x, 0) / 4 / pixels.width;
        const centreY = xs.reduce((sum, p) => sum + p.y, 0) / 4 / pixels.height;
        process.stdout.write(
            `  ${String(rank).padStart(2)}  score ${card.score.toFixed(4)}  ` +
                `fläche ${(card.areaFraction * 100).toFixed(1).padStart(5)}%  ` +
                `mitte ${centreX.toFixed(2)},${centreY.toFixed(2)}\n`,
        );
    }
}
