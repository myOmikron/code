//! Judges whether a rectified card is worth recognising at all, and evens out what glare did.
//!
//! A scan can fail for two very different reasons, and telling them apart matters because only
//! one of them is the scanner's fault. Either detection cropped the wrong rectangle, which is
//! fixable, or the photo itself is out of focus, which is not: no matching stage recovers detail
//! that was never captured. The live scanner needs the second case as its own answer, so it can
//! ask for a steadier shot instead of guessing.
import { loadOpenCv, withMats } from "./opencv";
import { aspectScore, symmetryScore } from "./card-detect";
import type { CardQuad, RgbaImage } from "./card-detect";

/**
 * Variance of the Laplacian, the standard focus measure.
 *
 * A sharp image has strong second derivatives spread across it; blur suppresses them. The value
 * is scale dependent, so it is only comparable between images of the same size, which every
 * rectified card is.
 *
 * @param image a rectified card
 * @returns the variance; higher is sharper
 */
export async function sharpness(image: RgbaImage): Promise<number> {
    const cv = await loadOpenCv();
    return withMats((track) => {
        const rgba = track(cv.matFromImageData(image));
        const grey = track(new cv.Mat());
        cv.cvtColor(rgba, grey, cv.COLOR_RGBA2GRAY);
        const laplacian = track(new cv.Mat());
        cv.Laplacian(grey, laplacian, cv.CV_64F);
        const mean = track(new cv.Mat());
        const deviation = track(new cv.Mat());
        cv.meanStdDev(laplacian, mean, deviation);
        const value = deviation.data64F[0];
        return value * value;
    });
}

/** Luminance statistics of a rectified card. */
export type Exposure = {
    /** Mean luminance, 0–255 */
    mean: number;
    /** Share of pixels at full white, 0–1 */
    clipped: number;
};

const CLIP_LEVEL = 250;

/**
 * Measures how a rectified card is lit.
 *
 * @param image
 * @param step sampling stride in pixels
 * @returns
 */
export function exposureOf(image: RgbaImage, step = 2): Exposure {
    let sum = 0;
    let clipped = 0;
    let count = 0;
    const { data, width, height } = image;
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const at = (y * width + x) * 4;
            const luminance = (data[at] * 299 + data[at + 1] * 587 + data[at + 2] * 114) / 1000;
            sum += luminance;
            if (luminance >= CLIP_LEVEL) clipped += 1;
            count += 1;
        }
    }
    if (count === 0) return { mean: 0, clipped: 0 };
    return { mean: sum / count, clipped: clipped / count };
}

/**
 * Mean corner movement between two frames, as a share of the card's height.
 *
 * @param previous
 * @param current
 * @returns
 */
export function motionBetween(previous: CardQuad, current: CardQuad): number {
    const corners: (keyof CardQuad)[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
    const height =
        (Math.hypot(current.bottomLeft.x - current.topLeft.x, current.bottomLeft.y - current.topLeft.y) +
            Math.hypot(current.bottomRight.x - current.topRight.x, current.bottomRight.y - current.topRight.y)) /
        2;
    if (height < 1) return Number.POSITIVE_INFINITY;
    const moved =
        corners.reduce(
            (sum, corner) =>
                sum + Math.hypot(current[corner].x - previous[corner].x, current[corner].y - previous[corner].y),
            0,
        ) / corners.length;
    return moved / height;
}

/** What the frame gate measures about one detected card. */
export type FrameQuality = {
    /** Share of the searched region the card covers, 0–1 */
    areaFraction: number;
    /** How equal opposite sides are, 0–1 */
    symmetry: number;
    /** How close the proportions are to a card's, 0–1 */
    aspect: number;
    /** Movement since the last frame, as a share of card height; infinite on first sight */
    motion: number;
    /** Laplacian variance; higher is sharper */
    sharpness: number;
    exposure: Exposure;
};

/**
 * Measures a detected card for the frame gate.
 *
 * @param crop the rectified card
 * @param quad
 * @param areaFraction
 * @param previous where the card was last frame, null on first sight
 * @returns
 */
export async function measureFrame(
    crop: RgbaImage,
    quad: CardQuad,
    areaFraction: number,
    previous: CardQuad | null,
): Promise<FrameQuality> {
    return {
        areaFraction,
        symmetry: symmetryScore(quad),
        aspect: aspectScore(quad),
        motion: previous ? motionBetween(previous, quad) : Number.POSITIVE_INFINITY,
        sharpness: await sharpness(crop),
        exposure: exposureOf(crop),
    };
}

/**
 * Evens out local contrast on the lightness channel, leaving colour alone.
 *
 * Not used by the shipped index, and kept as the losing side of a measurement rather than as a
 * recommendation. The idea was that a sleeve or a toploader throws a broad reflection across a
 * card and flattens it, and on one glared photo it did flip the correct printing from 0.657
 * against a wrong 0.686 to 0.709 against 0.644.
 *
 * Built into both sides of the chain and measured end to end, it lost or tied everywhere: 79
 * names against 83 over the two decklist sets, and 2 of 24 against 3 of 24 on the sleeved,
 * glare-heavy playmat session that motivated it. The single-photo probe had pointed the other
 * way, which is the same trap as the crop-sharpness proxy: a mid-pipeline number is a diagnostic,
 * never a target.
 *
 * It stays because `Preprocessing` needs a second variant to be a comparison at all, and the next
 * idea for glare will want to be measured the same way.
 *
 * @param image
 * @param clip how far local contrast may be stretched
 * @returns the equalised copy
 */
export async function equaliseLocalContrast(image: RgbaImage, clip = 4): Promise<RgbaImage> {
    const cv = await loadOpenCv();
    return withMats((track) => {
        const rgba = track(cv.matFromImageData(image));
        const lab = track(new cv.Mat());
        cv.cvtColor(rgba, lab, cv.COLOR_RGB2Lab);
        const channels = track(new cv.MatVector());
        cv.split(lab, channels);
        const lightness = track(channels.get(0));
        const clahe = track(new cv.CLAHE(clip, new cv.Size(8, 8)));
        clahe.apply(lightness, lightness);
        channels.set(0, lightness);
        cv.merge(channels, lab);
        const rgb = track(new cv.Mat());
        cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
        const out = track(new cv.Mat());
        cv.cvtColor(rgb, out, cv.COLOR_RGB2RGBA);
        return { data: new Uint8ClampedArray(out.data), width: image.width, height: image.height };
    });
}
