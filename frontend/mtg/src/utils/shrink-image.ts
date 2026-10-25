/** Longest edge an attached image is shrunk to */
export const IMAGE_LONG_EDGE = 2000;

/**
 * Shrinks a picture and encodes it again, which drops its metadata (EXIF, location)
 *
 * WebP where the browser encodes it, JPEG otherwise.
 *
 * @param image the picture as picked or as drawn
 * @param longEdge the longest edge the result may have
 * @returns the encoded picture
 */
export async function shrinkImage(image: Blob | ImageBitmap, longEdge = IMAGE_LONG_EDGE): Promise<Blob> {
    const bitmap = image instanceof Blob ? await createImageBitmap(image, { imageOrientation: "from-image" }) : image;
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (image instanceof Blob) bitmap.close();

    const webp = await encode(canvas, "image/webp");
    if (webp?.type === "image/webp") return webp;
    const jpeg = await encode(canvas, "image/jpeg");
    if (!jpeg) throw new Error("The browser could not encode the image");
    return jpeg;
}

/**
 * Encodes a canvas
 *
 * @param canvas what to encode
 * @param type the media type asked for, which a browser may ignore
 * @returns the encoded image, `null` when the browser could not
 */
function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}
