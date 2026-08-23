//! Decides whether a rectified quad actually holds a Magic card.
//!
//! Detection can only judge shape, and shape is not enough: a playmat edge, a desk seam and the
//! frame around a card's illustration all produce quads that pass every aspect and symmetry
//! test and then rectify into something that is not a card. Every such quad costs a full index
//! lookup and can outrank the real card.
//!
//! The signal used here is where a card's *structure* sits vertically. Every Magic printing,
//! whether normal, borderless or full-art, carries a name band near the top and a footer of
//! very small type at the bottom, and both show up as sharp horizontal intensity transitions in
//! a narrow row range. Rectification puts them at fixed positions, so the row profile of edge
//! density is comparable across cards and highly distinctive against arbitrary surfaces.
//!
//! {@link CARD_PROFILE} is the mean profile of real printings, measured over a sample of the
//! reference images by `test/likeness-calibrate.ts`. Rerun that script when the profile geometry
//! changes; do not hand-tune the numbers.
import type { RgbaImage } from "./card-detect";

/** Number of horizontal bands the card is divided into. */
export const PROFILE_BANDS = 48;
/** Intensity step across neighbouring pixels that counts as a transition. */
const EDGE_THRESHOLD = 24;
/** Horizontal margin skipped on both sides, as a fraction of the width. */
const SIDE_MARGIN = 0.06;

/**
 * Mean row profile of real printings, L2-normalized. Produced by `pnpm scan:likeness-calibrate`.
 */
export const CARD_PROFILE: number[] = [
    0.00513, 0.068, 0.06568, 0.21868, 0.12208, 0.06701, 0.09546, 0.10872, 0.11909, 0.12771, 0.13695, 0.1416, 0.14684,
    0.14969, 0.15052, 0.14943, 0.14922, 0.14874, 0.14535, 0.14163, 0.14013, 0.13474, 0.12953, 0.12358, 0.11881, 0.10924,
    0.07204, 0.09668, 0.20932, 0.05573, 0.07165, 0.15973, 0.17033, 0.20788, 0.20483, 0.20658, 0.19657, 0.19053, 0.19955,
    0.2078, 0.19622, 0.17867, 0.11753, 0.09636, 0.12157, 0.18094, 0.12335, 0.00225,
];

/**
 * Edge-density profile over horizontal bands, L2-normalized.
 *
 * Only horizontal neighbours are compared: text and frame lines produce strong horizontal
 * transitions, while smooth artwork and most background surfaces do not. Normalizing removes
 * overall contrast, so a dim photo and a bright scan of the same card score alike.
 *
 * @param image a rectified card
 * @returns one value per band, top to bottom
 */
export function rowProfile(image: RgbaImage): number[] {
    const { data, width, height } = image;
    const from = Math.floor(width * SIDE_MARGIN);
    const to = Math.ceil(width * (1 - SIDE_MARGIN));
    const profile = new Array<number>(PROFILE_BANDS).fill(0);
    const counts = new Array<number>(PROFILE_BANDS).fill(0);

    for (let y = 0; y < height; y += 1) {
        const band = Math.min(PROFILE_BANDS - 1, Math.floor((y / height) * PROFILE_BANDS));
        const row = y * width * 4;
        let previous = -1;
        for (let x = from; x < to; x += 1) {
            const offset = row + x * 4;
            const grey = (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000;
            if (previous >= 0) {
                if (Math.abs(grey - previous) > EDGE_THRESHOLD) profile[band] += 1;
                counts[band] += 1;
            }
            previous = grey;
        }
    }

    for (let band = 0; band < PROFILE_BANDS; band += 1) {
        profile[band] = counts[band] > 0 ? profile[band] / counts[band] : 0;
    }
    const norm = Math.hypot(...profile);
    if (norm < 1e-9) return profile;
    return profile.map((value) => value / norm);
}

/**
 * How much a rectified quad looks like a Magic card, 0 to 1.
 *
 * This is a cheap reject ahead of the index lookup, not an identification. It answers "is this
 * a card at all", and deliberately says nothing about which one.
 *
 * @param image a rectified card
 * @returns the cosine similarity to {@link CARD_PROFILE}, or 1 while no profile is calibrated
 */
export function cardLikeness(image: RgbaImage): number {
    if (CARD_PROFILE.length !== PROFILE_BANDS) return 1;
    const profile = rowProfile(image);
    let dot = 0;
    let template = 0;
    for (let band = 0; band < PROFILE_BANDS; band += 1) {
        dot += profile[band] * CARD_PROFILE[band];
        template += CARD_PROFILE[band] * CARD_PROFILE[band];
    }
    const norm = Math.sqrt(template);
    return norm < 1e-9 ? 0 : Math.max(0, Math.min(1, dot / norm));
}
