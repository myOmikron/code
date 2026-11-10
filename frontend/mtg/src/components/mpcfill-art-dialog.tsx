import { CheckCircleIcon, StarIcon as StarSolidIcon } from "@heroicons/react/20/solid";
import { StarIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Subheading,
    Text,
} from "components";
import { useTranslation } from "react-i18next";
import type { MpcFillImageResponse } from "src/api/generated";
import { formatBytes } from "src/utils/format";

/**
 * The properties for {@link MpcFillArtDialog}
 */
export type MpcFillArtDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The card face the art is picked for, as the reader knows it */
    title: string;
    /** What MPCFill has for it, starred drives first */
    images: Array<MpcFillImageResponse>;
    /** The id of the image that is picked, `null` while none is */
    chosen: string | null;
    /** What became of the reader's favorite, `null` when there is nothing to say */
    notice: string | null;
    /** Whether an image is starred */
    starred: (image: MpcFillImageResponse) => boolean;
    /** Stars an image, or takes the star off */
    onStar: (image: MpcFillImageResponse) => void;
    /** The starred drives */
    drives: Array<string>;
    /** Stars a drive, or takes the star off */
    onStarDrive: (source: string) => void;
    /** Takes one of the images */
    onChoose: (image: MpcFillImageResponse) => void;
    /** Closes the dialog without changing the pick */
    onClose: () => void;
};

/**
 * The art the community has drawn for one card face.
 *
 * Every image is somebody's file in a Google Drive folder, told apart by its
 * drive, resolution and size. Starred images come first, and a star sits on
 * each image and next to each drive's name.
 *
 * @returns the dialog
 */
export function MpcFillArtDialog({
    open,
    title,
    images,
    chosen,
    notice,
    starred,
    onStar,
    drives,
    onStarDrive,
    onChoose,
    onClose,
}: MpcFillArtDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();

    const favorites = images.filter(starred);
    const rest = images.filter((image) => !starred(image));

    /**
     * One grid of images
     *
     * @param list the images
     *
     * @returns the grid
     */
    const grid = (list: Array<MpcFillImageResponse>) => (
        <ul className={"grid grid-cols-2 gap-4 sm:grid-cols-3"}>
            {list.map((image) => (
                <ArtTile
                    key={image.id}
                    image={image}
                    chosen={image.id === chosen}
                    starred={starred(image)}
                    driveStarred={drives.includes(image.source)}
                    onChoose={() => onChoose(image)}
                    onStar={() => onStar(image)}
                    onStarDrive={() => onStarDrive(image.source)}
                />
            ))}
        </ul>
    );

    return (
        <Dialog open={open} onClose={onClose} size={"4xl"}>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
                {images.length === 0 ? t("description.no-art") : t("description.pick-art", { count: images.length })}
            </DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    {notice !== null && <Text className={"text-sm text-(--color-warning)"}>{notice}</Text>}
                    {images.length === 0 ? (
                        <Text className={"text-sm"}>{t("description.no-art-hint")}</Text>
                    ) : favorites.length === 0 ? (
                        grid(rest)
                    ) : (
                        <>
                            <section className={"flex flex-col gap-3"}>
                                <Subheading level={3}>{t("heading.favorite-art")}</Subheading>
                                {grid(favorites)}
                            </section>
                            {rest.length > 0 && (
                                <section className={"flex flex-col gap-3"}>
                                    <Subheading level={3}>{t("heading.all-art")}</Subheading>
                                    {grid(rest)}
                                </section>
                            )}
                        </>
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * The properties for {@link ArtTile}
 */
type ArtTileProps = {
    /** The image */
    image: MpcFillImageResponse;
    /** Whether it is the one picked */
    chosen: boolean;
    /** Whether it is starred */
    starred: boolean;
    /** Whether its drive is starred */
    driveStarred: boolean;
    /** Takes it */
    onChoose: () => void;
    /** Stars it, or takes the star off */
    onStar: () => void;
    /** Stars its drive, or takes the star off */
    onStarDrive: () => void;
};

/**
 * One image to pick, with its stars
 *
 * @returns the tile
 */
function ArtTile({ image, chosen, starred, driveStarred, onChoose, onStar, onStarDrive }: ArtTileProps) {
    const [t] = useTranslation("game-utils");

    return (
        <li
            className={clsx(
                "relative flex flex-col gap-1 rounded-(--radius-card) p-2 transition",
                chosen
                    ? "bg-(--color-brand-500)/10 ring-2 ring-(--color-brand-500)"
                    : "ring-1 ring-zinc-950/5 hover:bg-lime-400/15 dark:ring-white/10 dark:hover:bg-lime-400/15",
            )}
        >
            <button
                type={"button"}
                onClick={onChoose}
                aria-pressed={chosen}
                className={"flex w-full cursor-pointer flex-col gap-2 text-left"}
            >
                <span className={"relative block overflow-hidden rounded-(--radius-control)"}>
                    <img
                        src={image.thumbnail_medium}
                        alt={image.name}
                        loading={"lazy"}
                        className={"aspect-[63/88] w-full bg-zinc-950/5 object-cover dark:bg-white/5"}
                    />
                    {chosen && <CheckCircleIcon className={"absolute top-1.5 left-1.5 size-5 text-(--color-accent)"} />}
                </span>
                <span className={"min-w-0"}>
                    <span
                        className={"block truncate text-xs font-medium text-zinc-950 dark:text-white"}
                        title={image.name}
                    >
                        {image.name}
                    </span>
                    <span className={"block text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                        {`${t("label.dpi", { dpi: image.dpi })} · ${formatBytes(image.size)}`}
                    </span>
                </span>
            </button>

            <button
                type={"button"}
                onClick={onStar}
                aria-pressed={starred}
                aria-label={t(starred ? "accessibility.unstar-art" : "accessibility.star-art")}
                title={t(starred ? "accessibility.unstar-art" : "accessibility.star-art")}
                className={clsx(
                    "absolute top-3.5 right-3.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-zinc-950/70 backdrop-blur-sm transition hover:text-yellow-400 focus:outline-2 focus:outline-offset-1 focus:outline-white",
                    starred ? "text-yellow-400" : "text-white",
                )}
            >
                {starred ? <StarSolidIcon className={"size-4"} /> : <StarIcon className={"size-4"} />}
            </button>

            <button
                type={"button"}
                onClick={onStarDrive}
                aria-pressed={driveStarred}
                aria-label={t(driveStarred ? "accessibility.unstar-drive" : "accessibility.star-drive", {
                    name: image.source,
                })}
                title={t(driveStarred ? "accessibility.unstar-drive" : "accessibility.star-drive", {
                    name: image.source,
                })}
                className={
                    "flex min-w-0 cursor-pointer items-center gap-1 self-start rounded text-xs text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                }
            >
                {driveStarred ? (
                    <StarSolidIcon className={"size-3.5 shrink-0 text-yellow-500 dark:text-yellow-400"} />
                ) : (
                    <StarIcon className={"size-3.5 shrink-0"} />
                )}
                <span className={"truncate"}>{image.source}</span>
            </button>
        </li>
    );
}
