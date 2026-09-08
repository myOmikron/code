//! Reports what each stage of the Hough quad search produces for one photo.
import { basename, extname } from "node:path";
import sharp from "sharp";
import { loadOpenCv, withMats } from "../src/scanner/opencv";
import { houghQuads } from "../src/scanner/hough-quads";
import { aspectScore, orderCorners, symmetryScore } from "../src/scanner/card-detect";

const input = process.argv[2];
const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
const cv = await loadOpenCv();

const scale = Math.min(1, 720 / Math.max(pixels.width, pixels.height));
const w = Math.round(pixels.width * scale);
const h = Math.round(pixels.height * scale);

withMats((track) => {
    const full = track(cv.matFromImageData(pixels));
    const rgba = track(new cv.Mat());
    cv.resize(full, rgba, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    const gray = track(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    const tmp = track(new cv.Mat());
    const otsu = cv.threshold(blurred, tmp, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));

    console.log(`${basename(input, extname(input))}  ${w}x${h}  otsu ${otsu.toFixed(0)}`);
    for (const factor of [0.6, 1, 1.6]) {
        const edges = track(new cv.Mat());
        cv.Canny(blurred, edges, Math.max(10, otsu * factor * 0.5), Math.max(30, otsu * factor));
        cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);

        const lines = track(new cv.Mat());
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, Math.max(20, Math.max(w, h) * 0.07), Math.max(w, h) * 0.03);
        const quads = houghQuads(cv, edges, w, h);
        console.log(
            `  canny ${factor}: rows=${lines.rows} cols=${lines.cols} data32S=${lines.data32S.length} type=${lines.type()}, ${quads.length} quads` +
                (quads.length ? `, bestes support ${quads[0].support.toFixed(2)} aspect ${aspectScore(quads[0].quad).toFixed(2)}` : ""),
        );
    }
});
