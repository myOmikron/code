//! Verifies a candidate printing by matching local features against its reference image.
//!
//! A global embedding answers "which card is this most like", which is the right question for
//! narrowing 111k printings down to a handful and the wrong one for deciding between them. Two
//! printings sharing an illustration differ in a set symbol and a line of small type, and a
//! single vector cannot carry that. Local features can: a correct pair produces hundreds of
//! keypoint correspondences that all agree on one homography, a wrong pair produces a scatter
//! that agrees on nothing.
//!
//! Descriptors are handed around as plain typed arrays rather than as OpenCV Mats. Mats live in
//! the WASM heap and have to be freed by hand, which makes them unfit for anything that is kept
//! between calls, and the typed arrays are also exactly what a precomputed index would store.
import { loadOpenCv, withMats } from "./opencv";
import type { RgbaImage } from "./card-detect";

/**
 * The local features of one card image
 */
export type CardFeatures = {
    /** `count` × 32 bytes of ORB descriptor */
    descriptors: Uint8Array;
    /** `count` × 2 floats of keypoint position */
    points: Float32Array;
    count: number;
};

/**
 * The outcome of verifying one candidate
 */
export type VerifyResult = {
    /** Correspondences that survive the ratio test */
    matches: number;
    /** Of those, the ones consistent with a single homography */
    inliers: number;
    /** inliers divided by the smaller feature count, 0 to 1 */
    ratio: number;
    /** Row-major 3×3 mapping query pixels onto the reference, or null when none was found */
    homography: number[] | null;
};

/** ORB descriptor width in bytes. */
const DESCRIPTOR_BYTES = 32;
/** Lowe's ratio test threshold; below this a match is considered distinctive. */
const RATIO_TEST = 0.78;
/** Reprojection tolerance for RANSAC, in pixels of the rectified frame. */
const RANSAC_THRESHOLD = 4;
/** Fewest ratio-test matches worth running a homography on. */
const MIN_MATCHES = 8;
/** Intensity spread between candidate references that marks a pixel as discriminating. */
const MASK_STEP = 40;
/** Fewest discriminating pixels needed before the comparison says anything. */
const MIN_MASK_PIXELS = 40;

/**
 * Extracts ORB features from a rectified card.
 *
 * @param image a rectified card, 488×680
 * @param maxFeatures upper bound on keypoints
 * @returns the features, possibly empty
 */
export async function describeCard(image: RgbaImage, maxFeatures = 500): Promise<CardFeatures> {
    const cv = await loadOpenCv();
    return withMats((track) => {
        const rgba = track(cv.matFromImageData(image));
        const grey = track(new cv.Mat());
        cv.cvtColor(rgba, grey, cv.COLOR_RGBA2GRAY);

        const orb = track(new cv.ORB(maxFeatures));
        const keypoints = track(new cv.KeyPointVector());
        const descriptors = track(new cv.Mat());
        const mask = track(new cv.Mat());
        orb.detectAndCompute(grey, mask, keypoints, descriptors);

        const count = keypoints.size();
        const points = new Float32Array(count * 2);
        for (let index = 0; index < count; index += 1) {
            const point = keypoints.get(index).pt;
            points[index * 2] = point.x;
            points[index * 2 + 1] = point.y;
        }
        return {
            descriptors: new Uint8Array(descriptors.data.slice(0, count * DESCRIPTOR_BYTES)),
            points,
            count,
        };
    });
}

/**
 * Counts how many feature correspondences between two cards agree on one homography.
 *
 * The ratio test alone is not enough: a busy card matches a busy card in dozens of places by
 * chance. What separates a real pair is that its correspondences are geometrically consistent,
 * which is what the RANSAC inlier count measures.
 *
 * @param query features of the scanned card
 * @param reference features of a candidate printing
 * @returns match and inlier counts
 */
export async function verifyAgainst(query: CardFeatures, reference: CardFeatures): Promise<VerifyResult> {
    const empty = { matches: 0, inliers: 0, ratio: 0, homography: null };
    if (query.count < MIN_MATCHES || reference.count < MIN_MATCHES) return empty;
    const cv = await loadOpenCv();

    return withMats((track) => {
        const queryDescriptors = track(
            cv.matFromArray(query.count, DESCRIPTOR_BYTES, cv.CV_8U, [...query.descriptors]),
        );
        const referenceDescriptors = track(
            cv.matFromArray(reference.count, DESCRIPTOR_BYTES, cv.CV_8U, [...reference.descriptors]),
        );

        const matcher = track(new cv.BFMatcher(cv.NORM_HAMMING, false));
        const knn = track(new cv.DMatchVectorVector());
        matcher.knnMatch(queryDescriptors, referenceDescriptors, knn, 2);

        const from: number[] = [];
        const to: number[] = [];
        for (let index = 0; index < knn.size(); index += 1) {
            const pair = knn.get(index);
            if (pair.size() < 2) continue;
            const best = pair.get(0);
            const second = pair.get(1);
            if (best.distance >= RATIO_TEST * second.distance) continue;
            from.push(query.points[best.queryIdx * 2], query.points[best.queryIdx * 2 + 1]);
            to.push(reference.points[best.trainIdx * 2], reference.points[best.trainIdx * 2 + 1]);
        }

        const matches = from.length / 2;
        if (matches < MIN_MATCHES) return { matches, inliers: 0, ratio: 0, homography: null };

        const source = track(cv.matFromArray(matches, 1, cv.CV_32FC2, from));
        const target = track(cv.matFromArray(matches, 1, cv.CV_32FC2, to));
        const inlierMask = track(new cv.Mat());
        const homography = track(cv.findHomography(source, target, cv.RANSAC, RANSAC_THRESHOLD, inlierMask));
        if (homography.empty()) return { matches, inliers: 0, ratio: 0, homography: null };

        let inliers = 0;
        for (let index = 0; index < inlierMask.rows; index += 1) if (inlierMask.data[index]) inliers += 1;
        return {
            matches,
            inliers,
            ratio: inliers / Math.min(query.count, reference.count),
            homography: Array.from(homography.data64F as Float64Array),
        };
    });
}

/**
 * Decides between candidate printings that local features cannot separate.
 *
 * Two printings of one card can be the same picture. The List reprints an existing printing and
 * adds a stamp of about eleven by seventeen pixels in the bottom left; promo variants differ
 * just as little. Feature matching answers "same card" for both and its inlier counts come out
 * near enough to be a coin flip.
 *
 * Rather than testing for any one of those marks, this compares the query against each candidate
 * only where the candidates differ from each other*. The mask is derived from the reference
 * images at match time, so it lands on whatever actually distinguishes this particular pair,
 * be it a stamp, a set symbol or a collector line, without any of them being named here.
 *
 * Alignment is what makes it work at all: eleven pixels is less than the offset a sleeve already
 * introduces. Each candidate's own homography, the one its inliers were counted under, warps the
 * query into that reference's frame first, which removes the offset exactly.
 *
 * @param query the rectified card that was scanned
 * @param candidates references with the homography that mapped the query onto them
 * @returns the best candidate's index and its per-candidate errors, or null when the references
 *          are too alike to judge
 */
export async function discriminatePrintings(
    query: RgbaImage,
    candidates: { reference: RgbaImage; homography: number[] }[],
): Promise<{ index: number; errors: number[]; maskPixels: number } | null> {
    if (candidates.length < 2) return null;
    const cv = await loadOpenCv();
    const { width, height } = candidates[0].reference;
    if (candidates.some((entry) => entry.reference.width !== width || entry.reference.height !== height)) return null;

    return withMats((track) => {
        const greys = candidates.map((entry) => {
            const rgba = track(cv.matFromImageData(entry.reference));
            const grey = track(new cv.Mat());
            cv.cvtColor(rgba, grey, cv.COLOR_RGBA2GRAY);
            return new Uint8Array(grey.data);
        });

        const pixels = width * height;
        const mask = new Uint8Array(pixels);
        let maskPixels = 0;
        for (let index = 0; index < pixels; index += 1) {
            let low = 255;
            let high = 0;
            for (const grey of greys) {
                const value = grey[index];
                if (value < low) low = value;
                if (value > high) high = value;
            }
            if (high - low > MASK_STEP) {
                mask[index] = 1;
                maskPixels += 1;
            }
        }
        if (maskPixels < MIN_MASK_PIXELS) return null;

        const queryRgba = track(cv.matFromImageData(query));
        const queryGrey = track(new cv.Mat());
        cv.cvtColor(queryRgba, queryGrey, cv.COLOR_RGBA2GRAY);

        const errors = candidates.map((entry, candidate) => {
            const transform = track(cv.matFromArray(3, 3, cv.CV_64F, entry.homography));
            const warped = track(new cv.Mat());
            cv.warpPerspective(
                queryGrey,
                warped,
                transform,
                new cv.Size(width, height),
                cv.INTER_LINEAR,
                cv.BORDER_CONSTANT,
                new cv.Scalar(),
            );
            const warpedData = warped.data;
            const reference = greys[candidate];
            let sum = 0;
            let counted = 0;
            for (let index = 0; index < pixels; index += 1) {
                if (!mask[index] || warpedData[index] === 0) continue;
                sum += Math.abs(warpedData[index] - reference[index]);
                counted += 1;
            }
            return counted < MIN_MASK_PIXELS ? Infinity : sum / counted;
        });

        let best = 0;
        for (let index = 1; index < errors.length; index += 1) if (errors[index] < errors[best]) best = index;
        return Number.isFinite(errors[best]) ? { index: best, errors, maskPixels } : null;
    });
}
