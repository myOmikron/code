//! Lists every quad detection considers for one photo, before and after suppression.
//!
//! Answers the one question a failure picture cannot: was the card's own outline never found,
//! or was it found and then discarded by a filter.
import { basename, extname } from "node:path";
import sharp from "sharp";
import { detectCardsIn } from "../src/scanner/card-detect";
import type { DetectedCard, RgbaImage } from "../src/scanner/card-detect";

const input = process.argv[2];
const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels: RgbaImage = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };

const show = (cards: DetectedCard[], label: string) => {
    console.log(`\n${label} (${cards.length}):`);
    for (const card of cards.slice(0, 12)) {
        const width =
            (Math.hypot(card.quad.topRight.x - card.quad.topLeft.x, card.quad.topRight.y - card.quad.topLeft.y) +
                Math.hypot(card.quad.bottomRight.x - card.quad.bottomLeft.x, card.quad.bottomRight.y - card.quad.bottomLeft.y)) / 2;
        const height =
            (Math.hypot(card.quad.bottomLeft.x - card.quad.topLeft.x, card.quad.bottomLeft.y - card.quad.topLeft.y) +
                Math.hypot(card.quad.bottomRight.x - card.quad.topRight.x, card.quad.bottomRight.y - card.quad.topRight.y)) / 2;
        console.log(
            `  fläche ${(card.areaFraction * 100).toFixed(1).padStart(5)}%  score ${card.score.toFixed(3)}  ` +
                `seitenverh. ${(width / height).toFixed(3)}  mitte ${((card.quad.topLeft.x + card.quad.bottomRight.x) / 2).toFixed(0)},${((card.quad.topLeft.y + card.quad.bottomRight.y) / 2).toFixed(0)}`,
        );
    }
};

console.log(`${basename(input, extname(input))}  ${pixels.width}x${pixels.height}`);
const final = await detectCardsIn(pixels, {
    onCandidates: show,
    onRejects: (counts) => console.log('\nabgewiesen:', JSON.stringify(counts)),
});
show(final, "final");
