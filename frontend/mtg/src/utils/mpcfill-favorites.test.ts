import { describe, expect, it } from "vitest";
import type { MpcFillFavoriteResponse, MpcFillImageResponse } from "src/api/generated";
import { mpcByDrives, mpcFavorite, mpcFavoriteImage, mpcStarOf } from "src/utils/mpcfill-favorites";

describe("favorites", () => {
    /**
     * An image in a drive
     *
     * @param id its drive id
     * @param name its file name
     * @param source its drive
     *
     * @returns the image
     */
    const found = (id: string, name: string, source: string): MpcFillImageResponse => ({
        id,
        name,
        source,
        dpi: 800,
        language: "EN",
        size: 1,
        tags: [],
        thumbnail_medium: "",
        thumbnail_small: "",
    });

    /**
     * A starred image
     *
     * @param face the face it was starred for
     * @param image the image as it was found then
     *
     * @returns the favorite
     */
    const starred = (face: string | null, image: MpcFillImageResponse): MpcFillFavoriteResponse => ({
        uuid: `star-${face ?? "back"}-${image.id}`,
        face,
        image: mpcFavoriteImage(image),
        starred_at: "2026-11-01T00:00:00Z",
    });

    const original = found("a", "Sol Ring.png", "Drive A");
    const other = found("b", "Sol Ring (2).png", "Drive B");

    it("finds the same file", () => {
        const match = mpcFavorite([other, original], [starred("Sol Ring", original)], "Sol Ring");

        expect(match?.status).toBe("favorite");
        expect(match?.image).toBe(original);
    });

    it("takes the newest favorite that is still there", () => {
        const favorites = [starred("Sol Ring", found("gone", "Gone.png", "Drive C")), starred("Sol Ring", other)];

        expect(mpcFavorite([original, other], favorites, "Sol Ring")?.image).toBe(other);
    });

    it("takes a re-upload in the same drive", () => {
        const reupload = found("a2", "Sol Ring.png", "Drive A");
        const match = mpcFavorite([other, reupload], [starred("Sol Ring", original)], "Sol Ring");

        expect(match?.status).toBe("updated");
        expect(match?.image).toBe(reupload);
    });

    it("only suggests the same file in another drive", () => {
        const rehost = found("c", "Sol Ring.png", "Drive C");
        const match = mpcFavorite([other, rehost], [starred("Sol Ring", original)], "Sol Ring");

        expect(match?.status).toBe("suggested");
        expect(match?.image).toBeNull();
        expect(match?.suggestion).toBe(rehost);
    });

    it("reports a favorite that is gone", () => {
        expect(mpcFavorite([other], [starred("Sol Ring", original)], "Sol Ring")?.status).toBe("missing");
    });

    it("keeps faces and the cardback apart", () => {
        const favorites = [starred(null, original)];

        expect(mpcFavorite([original], favorites, "Sol Ring")).toBeNull();
        expect(mpcFavorite([original], favorites, null)?.status).toBe("favorite");
        expect(mpcStarOf(favorites, null, "a")).toBe(favorites[0]);
        expect(mpcStarOf(favorites, "Sol Ring", "a")).toBeUndefined();
    });

    it("puts starred drives first, otherwise keeping MPCFill's order", () => {
        const third = found("c", "x.png", "Drive C");

        expect(mpcByDrives([original, other, third], ["Drive C", "Drive B"])).toStrictEqual([third, other, original]);
        expect(mpcByDrives([original, other], [])).toStrictEqual([original, other]);
    });
});
