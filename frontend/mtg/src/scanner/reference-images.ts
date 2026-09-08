//! Fetches the reference image of a printing so its local features can be compared.
//!
//! The descriptors themselves cannot be shipped: 111k printings at five hundred keypoints of
//! thirty-two bytes is close to two gigabytes. The images can be fetched instead, and only for
//! the handful of candidates a scan actually shortlists. They come from the same CDN the
//! collection already loads artwork from, so most of them are in the service worker's cache
//! before the scanner ever asks.
//!
//! The url follows from the Scryfall id, which the index already stores, so no second lookup and
//! no extra megabytes in the index.
import type { RgbaImage } from "./card-detect";

/** Geometry the reference is decoded at; it has to match what the index was built from. */
const REFERENCE_WIDTH = 488;
const REFERENCE_HEIGHT = 680;

/**
 * The url of a printing's scan
 *
 * @param id the Scryfall id
 * @param face 0 for the front, 1 for the back of a double-faced card
 * @returns the image url
 */
export function referenceImageUrl(id: string, face: number): string {
    const side = face === 0 ? "front" : "back";
    return `https://cards.scryfall.io/normal/${side}/${id[0]}/${id[1]}/${id}.jpg`;
}

/**
 * Loads a printing's reference scan as pixels.
 *
 * `crossOrigin` is not optional here: the pixels are read back, which a tainted canvas forbids.
 * The collection's artwork requests set it too, so both share one cache entry instead of
 * poisoning each other with an opaque response.
 *
 * @param id the Scryfall id
 * @param face which side
 * @returns the decoded reference, or null when it cannot be fetched
 */
export async function loadReferenceImage(id: string, face: number): Promise<RgbaImage | null> {
    try {
        const response = await fetch(referenceImageUrl(id, face), { mode: "cors" });
        if (!response.ok) return null;
        const bitmap = await createImageBitmap(await response.blob());
        try {
            const canvas = new OffscreenCanvas(REFERENCE_WIDTH, REFERENCE_HEIGHT);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return null;
            context.drawImage(bitmap, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
            const pixels = context.getImageData(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
            return { data: pixels.data, width: pixels.width, height: pixels.height };
        } finally {
            bitmap.close();
        }
    } catch {
        return null;
    }
}
