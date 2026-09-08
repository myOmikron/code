//! Judges whether a rectified card is worth recognising at all, and evens out what glare did.
//!
//! A scan can fail for two very different reasons, and telling them apart matters because only
//! one of them is the scanner's fault. Either detection cropped the wrong rectangle, which is
//! fixable, or the photo itself is out of focus, which is not: no matching stage recovers detail
//! that was never captured. The live scanner needs the second case as its own answer, so it can
//! ask for a steadier shot instead of guessing.
import { loadOpenCv, withMats } from "./opencv";
import type { RgbaImage } from "./card-detect";

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
