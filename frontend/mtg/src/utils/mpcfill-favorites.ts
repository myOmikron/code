/**
 * The MPCFill art an account starred, found again among what a search returns.
 *
 * A favorite keeps its image's drive and file name, so a re-upload in the same
 * drive is recognised and a copy in another drive can be offered.
 */

import type { MpcFillFavoriteImage, MpcFillFavoriteResponse, MpcFillImageResponse } from "src/api/generated";

/** How a favorite turned up among what was found for its face */
export type MpcFavoriteStatus = "favorite" | "updated" | "suggested" | "missing";

/** What the account's favorites say about one face */
export type MpcFavoriteMatch = {
    /** How it was found */
    status: MpcFavoriteStatus;
    /** The favorite it was found from */
    favorite: MpcFillFavoriteResponse;
    /** The image to take: the favorite, or the file that replaced it */
    image: MpcFillImageResponse | null;
    /** The same file in another drive, offered rather than taken */
    suggestion: MpcFillImageResponse | null;
};

/**
 * Finds the account's favorite for one face among what was found for it
 *
 * Newest favorite first: the same file, then the same file name in the same
 * drive (a re-upload), then the same file name in another drive.
 *
 * @param images what was found for the face
 * @param favorites the account's favorites, newest first
 * @param face the name MPCFill is asked for, `null` for the cardback
 *
 * @returns the match, `null` when nothing for the face is starred
 */
export function mpcFavorite(
    images: Array<MpcFillImageResponse>,
    favorites: Array<MpcFillFavoriteResponse>,
    face: string | null,
): MpcFavoriteMatch | null {
    const mine = favorites.filter((favorite) => (favorite.face ?? null) === face);
    const first = mine[0];
    if (first === undefined) return null;

    for (const favorite of mine) {
        const image = images.find((found) => found.id === favorite.image.drive_id);
        if (image !== undefined) return { status: "favorite", favorite, image, suggestion: null };
    }
    for (const favorite of mine) {
        const image = images.find(
            (found) => found.source === favorite.image.source && found.name === favorite.image.file_name,
        );
        if (image !== undefined) return { status: "updated", favorite, image, suggestion: null };
    }
    for (const favorite of mine) {
        const suggestion = images.find((found) => found.name === favorite.image.file_name);
        if (suggestion !== undefined) return { status: "suggested", favorite, image: null, suggestion };
    }
    return { status: "missing", favorite: first, image: null, suggestion: null };
}

/**
 * The favorite that stars an image for a face
 *
 * @param favorites the account's favorites
 * @param face the name MPCFill is asked for, `null` for the cardback
 * @param id the image's drive id
 *
 * @returns the favorite, `undefined` when the image is not starred for the face
 */
export function mpcStarOf(
    favorites: Array<MpcFillFavoriteResponse>,
    face: string | null,
    id: string,
): MpcFillFavoriteResponse | undefined {
    return favorites.find((favorite) => (favorite.face ?? null) === face && favorite.image.drive_id === id);
}

/**
 * What was found for a face, the starred drives first in their order
 *
 * @param images what was found
 * @param drives the starred drives, first one first
 *
 * @returns the images, otherwise in MPCFill's order
 */
export function mpcByDrives(images: Array<MpcFillImageResponse>, drives: Array<string>): Array<MpcFillImageResponse> {
    if (drives.length === 0) return images;
    const rank = (image: MpcFillImageResponse) => {
        const at = drives.indexOf(image.source);
        return at === -1 ? drives.length : at;
    };
    return [...images].sort((left, right) => rank(left) - rank(right));
}

/**
 * An image as a favorite keeps it
 *
 * @param image the image
 *
 * @returns what is stored
 */
export function mpcFavoriteImage(image: MpcFillImageResponse): MpcFillFavoriteImage {
    return { drive_id: image.id, file_name: image.name, source: image.source };
}
