/**
 * The MPCFill images and drives the account starred.
 */

import { notify } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { MpcFillFavoriteResponse, MpcFillImageResponse } from "src/api/generated";
import { mpcFavoriteImage, mpcStarred } from "src/utils/mpcfill";

/** What {@link useMpcFavorites} hands back */
export type MpcFavorites = {
    /** The starred images, newest first */
    images: Array<MpcFillFavoriteResponse>;
    /** The starred drives, first one first */
    drives: Array<string>;
    /** Stars an image for a face, or takes the star off again */
    toggle: (face: string | null, image: MpcFillImageResponse) => void;
    /** Moves a favorite's star to the file that replaced it */
    replace: (favorite: MpcFillFavoriteResponse, image: MpcFillImageResponse) => void;
    /** Stars a drive, or takes the star off again */
    toggleDrive: (source: string) => void;
    /** Sets the starred drives */
    setDrives: (drives: Array<string>) => void;
};

/**
 * The account's MPCFill favorites, saved as they change
 *
 * Changes show at once. A failed save says so and reloads what the server holds.
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
    function load() {
        return Api.mpcfill.favorites
            .list()
            .then((favorites) => {
                setImages(favorites.images);
                setDrivesState(favorites.drives);
            })
            .catch(() => undefined);
    }

    useEffect(() => {
        void load();
    }, []);

    /**
     * Waits for a save, and reloads when it fails
     *
     * @param request the save
     */
    function save(request: Promise<unknown>) {
        request.catch(() => {
            notify.error(t("toast.favorite-not-saved"));
            void load();
        });
    }

    /**
     * Sets the starred drives
     *
     * @param next the drives, first one first
     */
    function setDrives(next: Array<string>) {
        setDrivesState(next);
        save(Api.mpcfill.favorites.setDrives(next));
    }

    return {
        images,
        drives,
        toggle: (face, image) => {
            const others = (known: MpcFillFavoriteResponse) => known.image.drive_id !== image.id;
            if (mpcStarred(images, face, image.id)) {
                setImages((previous) => previous.filter(others));
                save(Api.mpcfill.favorites.unstar(image.id));
                return;
            }
            const starred = { face, image: mpcFavoriteImage(image), starred_at: new Date().toISOString() };
            setImages((previous) => [starred, ...previous.filter(others)]);
            save(Api.mpcfill.favorites.star(face, starred.image));
        },
        replace: (favorite, image) => {
            const old = favorite.image.drive_id;
            const moved = { ...favorite, image: mpcFavoriteImage(image) };
            setImages((previous) =>
                previous
                    .filter((known) => known.image.drive_id !== image.id)
                    .map((known) => (known.image.drive_id === old ? moved : known)),
            );
            save(Api.mpcfill.favorites.replace(old, moved.image));
        },
        toggleDrive: (source) =>
            setDrives(drives.includes(source) ? drives.filter((drive) => drive !== source) : [...drives, source]),
        setDrives,
    };
}
