import { CheckCircleIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle, Text } from "components";
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
    /** What MPCFill has for it, in their own order */
    images: Array<MpcFillImageResponse>;
    /** The id of the image that is picked, `null` while none is */
    chosen: string | null;
    /** Takes one of the images */
    onChoose: (image: MpcFillImageResponse) => void;
    /** Closes the dialog without changing the pick */
    onClose: () => void;
};

/**
 * The art the community has drawn for one card face.
 *
 * Every image is somebody's file in a Google Drive folder, and what tells them
 * apart is what the tiles say: which drive it came from, at what resolution,
 * and how large the file is. Resolution is the one that decides whether a proxy
 * looks printed or photocopied — MakePlayingCards prints at 800 dpi, and their
 * own guidance is not to go below 300 — so it sits on the tile rather than
 * behind a hover.
 *
 * The thumbnails are Google's, served straight from the drive the image lives
 * in. Nothing is downloaded here: an order names the file, and
 * MakePlayingCards fetches it when the order is placed.
 *
 * @returns the dialog
 */
export function MpcFillArtDialog({ open, title, images, chosen, onChoose, onClose }: MpcFillArtDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} size={"4xl"}>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
                {images.length === 0 ? t("description.no-art") : t("description.pick-art", { count: images.length })}
            </DialogDescription>
            <DialogBody>
                {images.length === 0 ? (
                    <Text className={"text-sm"}>{t("description.no-art-hint")}</Text>
                ) : (
                    <ul className={"grid grid-cols-2 gap-4 sm:grid-cols-3"}>
                        {images.map((image) => (
                            <li key={image.id}>
                                <button
                                    type={"button"}
                                    onClick={() => onChoose(image)}
                                    aria-pressed={image.id === chosen}
                                    className={clsx(
                                        "group flex w-full flex-col gap-2 rounded-(--radius-card) p-2 text-left transition",
                                        image.id === chosen
                                            ? "bg-(--color-brand-500)/10 ring-2 ring-(--color-brand-500)"
                                            : "ring-1 ring-zinc-950/5 hover:bg-zinc-950/5 dark:ring-white/10 dark:hover:bg-white/5",
                                    )}
                                >
                                    <span className={"relative block overflow-hidden rounded-(--radius-control)"}>
                                        {/* The 800-across thumbnail rather than the
                                            400: these tiles are wide enough that the
                                            smaller one goes soft on a retina screen,
                                            and the browser only fetches what is
                                            scrolled into view. */}
                                        <img
                                            src={image.thumbnail_medium}
                                            alt={image.name}
                                            loading={"lazy"}
                                            className={
                                                "aspect-[63/88] w-full bg-zinc-950/5 object-cover dark:bg-white/5"
                                            }
                                        />
                                        {image.id === chosen && (
                                            <CheckCircleIcon
                                                className={"absolute top-1.5 right-1.5 size-5 text-(--color-accent)"}
                                            />
                                        )}
                                    </span>
                                    <span className={"min-w-0"}>
                                        <span
                                            className={
                                                "block truncate text-xs font-medium text-zinc-950 dark:text-white"
                                            }
                                            title={image.name}
                                        >
                                            {image.name}
                                        </span>
                                        <span className={"block truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                                            {image.source}
                                        </span>
                                        <span className={"block text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                            {`${t("label.dpi", { dpi: image.dpi })} · ${formatBytes(image.size)}`}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
