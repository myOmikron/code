/**
 * The MPCFill images and drives the account starred.
 */

import { notify } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MpcFillFavoriteResponse, MpcFillImageResponse } from "src/api/generated";
import { mpcFavoriteImage, mpcStarOf } from "src/utils/mpcfill-favorites";

/** What {@link useMpcFavorites} hands back */
export type MpcFavorites = {
    /** The starred images, newest first */
    images: Array<MpcFillFavoriteResponse>;
    /** The starred drives, first one first */
    drives: Array<string>;
    /** Stars an image for a face, or takes the star off again */
    toggle: (face: string | null, image: MpcFillImageResponse) => void;
    /** Moves a favorite's star to the file that replaced its image */
    replace: (favorite: MpcFillFavoriteResponse, image: MpcFillImageResponse) => void;
    /** Stars a drive, or takes the star off again */
    toggleDrive: (source: string) => void;
    /** Sets the starred drives */
    setDrives: (drives: Array<string>) => void;
};

/**
 * The account's MPCFill favorites, saved as they change
 *
 * A failed save says so and reloads what the server holds.
 *
 * @returns the favorites and their mutators
 */
export function useMpcFavorites(): MpcFavorites {
    const [t] = useTranslation("game-utils");
    const [images, setImages] = useState<Array<MpcFillFavoriteResponse>>([]);
    const [drives, setDrivesState] = useState<Array<string>>([]);

    /**
     * Reads what the server holds
     *
     * @returns once it is read, or failed to be
     */
    function fetchFavorites() {
        return Api.mpcfillFavorites
            .list()
            .then((favorites) => {
                setImages(favorites.images);
                setDrivesState(favorites.drives);
            })
            .catch(() => undefined);
    }

    useEffect(() => {
        void fetchFavorites();
    }, []);

    /**
     * Waits for a save, and reloads when it fails
     *
     * @param request the save
     *
     * @returns what the save answered, `undefined` when it failed
     */
    async function persist<T>(request: Promise<T>): Promise<T | undefined> {
        try {
            return await request;
        } catch {
            notify.error(t("toast.favorite-not-saved"));
            void fetchFavorites();
            return undefined;
        }
    }

    /**
     * Sets the starred drives
     *
     * @param next the drives, first one first
     */
    function setDrives(next: Array<string>) {
        setDrivesState(next);
        void persist(Api.mpcfillFavorites.setDrives(next));
    }

    /**
     * Stars an image for a face, or takes the star off again
     *
     * @param face the name MPCFill is asked for, `null` for the cardback
     * @param image the image
     */
    async function toggle(face: string | null, image: MpcFillImageResponse) {
        const known = mpcStarOf(images, face, image.id);
        if (known !== undefined) {
            setImages((previous) => previous.filter((favorite) => favorite.uuid !== known.uuid));
            void persist(Api.mpcfillFavorites.unstar(known.uuid));
            return;
        }

        const starred = await persist(Api.mpcfillFavorites.star(face, mpcFavoriteImage(image)));
        if (starred === undefined) return;
        setImages((previous) => [
            starred,
            ...previous.filter((favorite) => mpcStarOf([favorite], face, image.id) === undefined),
        ]);
    }

    /**
     * Moves a favorite's star to the file that replaced its image
     *
     * @param favorite the favorite
     * @param image the file that replaced its image
     */
    function replace(favorite: MpcFillFavoriteResponse, image: MpcFillImageResponse) {
        const moved = { ...favorite, image: mpcFavoriteImage(image) };
        const face = favorite.face ?? null;
        setImages((previous) =>
            previous
                .filter((known) => known.uuid === favorite.uuid || mpcStarOf([known], face, image.id) === undefined)
                .map((known) => (known.uuid === favorite.uuid ? moved : known)),
        );
        void persist(Api.mpcfillFavorites.replace(favorite.uuid, moved.image));
    }

    return {
        images,
        drives,
        toggle: (face, image) => void toggle(face, image),
        replace,
        toggleDrive: (source) =>
            setDrives(drives.includes(source) ? drives.filter((drive) => drive !== source) : [...drives, source]),
        setDrives,
    };
}
