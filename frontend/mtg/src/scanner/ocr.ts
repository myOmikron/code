//! Reads the card's name off its title bar.
//!
//! The embedding is the scanner's main sense and it has one blind spot that no tuning closes: a
//! foil under a lamp, behind a toploader. Measured on one such card, the correct printing sat at
//! rank 1224 with a cosine of 0.336 while unrelated cards scored 0.64, and neither white balance
//! nor a deeper shortlist moved it. The name, meanwhile, was perfectly legible.
//!
//! So this is not a refinement of the visual match, it is a second, independent way of knowing
//! what the card is, and the two fail at different things. Text is unreadable when the card is
//! small or moving, which is exactly when the picture is still fine; the picture fails on glare
//! and foiling, which leaves the text alone.
//!
//! Only the title bar is read, not the whole card. It is a single line of large type in a known
//! place, which is the one job OCR does quickly and well: 91 ms for a strip against well over a
//! second for one model run.
import { RECTIFIED_HEIGHT, RECTIFIED_WIDTH } from "./card-detect";
import type { RgbaImage } from "./card-detect";

/** Where the title bar sits on a rectified card, as fractions of its width and height. */
const TITLE = { left: 0.06, right: 0.72, top: 0.035, bottom: 0.115 };
/** The strip is enlarged before recognition; Tesseract wants far bigger glyphs than a card has. */
const ENLARGE = 3;
/** Letters a card name can contain. Anything else is a misread and only invites bad matches. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-. ";
/** Shorter than this is noise, not a card name, and not worth a second pass over. */
const MIN_NAME_LENGTH = 3;
/**
 * Where `scripts/setup-ocr-assets.mjs` puts the recogniser's runtime, as an absolute URL.
 *
 * A function rather than a constant so that merely importing this module does not require a
 * browser: the Node benches pull in the live pipeline, and `self` does not exist there.
 *
 * Absolute on purpose. This runs inside the scanner's own worker, whose base URL is a blob:, and
 * `importScripts` cannot resolve a root-relative path against one of those: it rejects
 * "/tesseract/worker.min.js" outright. `fetch` resolves it happily, which is what made the
 * failure look like a missing file rather than a bad URL.
 *
 * @returns the absolute URL of the asset directory
 */
const assetRoot = (): string => `${self.location.origin}/tesseract`;

/**
 * A loaded recogniser
 */
export type Reader = {
    /**
     * Reads the name off one rectified card
     *
     * @param card a rectified card
     * @returns the text, or an empty string when nothing legible was found
     */
    readTitle(card: RgbaImage): Promise<string>;
};

let pending: Promise<Reader> | null = null;

/**
 * Cuts the title bar out of a rectified card and enlarges it.
 *
 * @param card a rectified card
 * @param upsideDown read the strip from the far corner backwards, for a card the other way up
 * @returns the strip as its own image
 */
export function titleStrip(card: RgbaImage, upsideDown: boolean): RgbaImage {
    const left = Math.round(TITLE.left * card.width);
    const right = Math.round(TITLE.right * card.width);
    const top = Math.round(TITLE.top * card.height);
    const bottom = Math.round(TITLE.bottom * card.height);
    const width = right - left;
    const height = bottom - top;

    const out = {
        data: new Uint8ClampedArray(width * ENLARGE * height * ENLARGE * 4),
        width: width * ENLARGE,
        height: height * ENLARGE,
    };
    for (let y = 0; y < height * ENLARGE; y += 1) {
        const row = top + Math.floor(y / ENLARGE);
        // Reading the same strip from the far corner, backwards, is the whole of turning the card
        // the other way up. Worth doing because the crop's orientation is a guess made upstream,
        // and a card whose title lands at the bottom would otherwise read as nothing at all.
        const sourceY = upsideDown ? card.height - 1 - row : row;
        for (let x = 0; x < width * ENLARGE; x += 1) {
            const column = left + Math.floor(x / ENLARGE);
            const sourceX = upsideDown ? card.width - 1 - column : column;
            const from = (sourceY * card.width + sourceX) * 4;
            const to = (y * width * ENLARGE + x) * 4;
            // Greyscale on the way out: the title bar's colour carries nothing, and a foil's
            // rainbow sheen is noise that the recogniser is better off never seeing.
            const grey = (card.data[from] * 299 + card.data[from + 1] * 587 + card.data[from + 2] * 114) / 1000;
            out.data[to] = grey;
            out.data[to + 1] = grey;
            out.data[to + 2] = grey;
            out.data[to + 3] = 255;
        }
    }
    return out;
}

/**
 * Turns raw pixels into something the recogniser will accept.
 *
 * Tesseract takes files, blobs and DOM elements, and answers "Error attempting to read image" to
 * anything else, `ImageData` included. Inside a worker there is no DOM to hand it, so the pixels
 * go through an OffscreenCanvas and come out as a PNG blob.
 *
 * @param strip the title strip
 * @returns the strip as a PNG blob
 */
async function encode(strip: RgbaImage): Promise<Blob> {
    const canvas = new OffscreenCanvas(strip.width, strip.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OffscreenCanvas liefert keinen 2d-Kontext");
    const pixels = context.createImageData(strip.width, strip.height);
    pixels.data.set(strip.data);
    context.putImageData(pixels, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
}

/**
 * Loads the recogniser once and returns it on every later call.
 *
 * @returns the reader
 */
export function loadReader(): Promise<Reader> {
    pending ??= (async (): Promise<Reader> => {
        // The runtime is generated, not committed, and `pnpm run ocr:assets` is a separate step
        // nobody remembers. Checking for it first turns "OCR quietly does nothing" into a
        // sentence that says what to run.
        const root = assetRoot();
        const probe = await fetch(`${root}/eng.traineddata.gz`, { method: "HEAD" }).catch(() => null);
        if (!probe?.ok) {
            throw new Error(`OCR-Dateien fehlen unter ${root} — "pnpm run ocr:assets" ausführen`);
        }

        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
            workerPath: `${root}/worker.min.js`,
            corePath: `${root}/core`,
            langPath: root,
            gzip: true,
            logger: () => undefined,
        });
        await worker.setParameters({
            tessedit_char_whitelist: ALPHABET,
            // One line of text, which is what a title bar is. Letting it look for paragraphs
            // costs time and invites it to read the artwork above.
            tessedit_pageseg_mode: "7" as never,
        });

        return {
            /**
             * Reads the name off one rectified card
             *
             * @param card
             * @returns the text, or an empty string
             */
            async readTitle(card: RgbaImage): Promise<string> {
                // Deliberately not caught here. The caller records the reason and the debug panel
                // shows it; swallowing it at both levels is how the first build managed to never
                // run OCR at all without saying so.
                const upright = await worker.recognize(await encode(titleStrip(card, false)));
                const text = upright.data.text.replace(/\s+/g, " ").trim();
                if (text.length >= MIN_NAME_LENGTH) return text;

                // Only when the upright reading came to nothing, so the usual case still pays for
                // one pass.
                const flipped = await worker.recognize(await encode(titleStrip(card, true)));
                return flipped.data.text.replace(/\s+/g, " ").trim();
            },
        };
    })();
    return pending;
}

/** The geometry the strip is cut from, exported so a bench can render the same crop. */
export const TITLE_REGION = { ...TITLE, width: RECTIFIED_WIDTH, height: RECTIFIED_HEIGHT };
