import {
    ArrowPathRoundedSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MinusIcon,
    PhotoIcon,
    PlusIcon,
    XMarkIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MpcFillImageResponse } from "src/api/generated";

/** One side of a card and the art there is for it */
export type MpcFillTileFace = {
    /** The name MPCFill was asked for, which is what a pick is filed under */
    name: string;
    /** Everything found for it, in MPCFill's own order */
    images: Array<MpcFillImageResponse>;
    /** The image that is taken, `null` while none is */
    chosen: MpcFillImageResponse | null;
    /** Whether the search for this face has run yet */
    searched: boolean;
};

/**
 * The properties for {@link MpcFillCardTile}
 */
export type MpcFillCardTileProps = {
    /** What the card is called */
    label: string;
    /** How many copies are ordered */
    copies: number;
    /** The front */
    front: MpcFillTileFace;
    /** The back, `null` for a card printed on one side */
    back: MpcFillTileFace | null;
    /** Takes the art this many steps along in what was found */
    onCycle: (face: MpcFillTileFace, step: number) => void;
    /** Opens the full choice for one side */
    onBrowse: (face: MpcFillTileFace, label: string) => void;
    /** One more copy */
    onMore: () => void;
    /** One copy fewer, and off the order with the last of them */
    onFewer: () => void;
    /** Off the order */
    onDrop: () => void;
};

/**
 * One card of the order, as the art it will be printed from.
 *
 * The tile is the card: what fills it is the image MakePlayingCards is going to
 * print, so choosing art is looking at cards rather than reading a list of file
 * names. Clicking the picture opens everything the drives have; the arrows step
 * through the same list without leaving the grid, which is the quick way past a
 * top hit that happens to be the wrong frame.
 *
 * Everything else a card needs sits on the tile at its lowest reasonable
 * weight — copies top left, dropping it top right — because a tile that only
 * shows its controls on hover shows nothing at all on a phone.
 *
 * A two-faced card is one tile with a flip: it is one card in the order, and
 * both of its sides are printed, so both are chosen here.
 *
 * @returns the tile
 */
export function MpcFillCardTile({
    label,
    copies,
    front,
    back,
    onCycle,
    onBrowse,
    onMore,
    onFewer,
    onDrop,
}: MpcFillCardTileProps) {
    const [t] = useTranslation("game-utils");
    const [flipped, setFlipped] = useState(false);

    const face = flipped && back !== null ? back : front;
    const at = face.chosen === null ? -1 : face.images.findIndex((image) => image.id === face.chosen?.id);

    return (
        <figure className={"flex min-w-0 flex-col gap-1.5"}>
            <div
                className={
                    "relative aspect-[63/88] overflow-hidden rounded-(--radius-card) bg-zinc-950/5 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10"
                }
            >
                <button
                    type={"button"}
                    onClick={() => onBrowse(face, label)}
                    className={"absolute inset-0 cursor-pointer"}
                    aria-label={t("accessibility.browse-art", { name: label })}
                >
                    {face.chosen === null ? (
                        <span
                            className={
                                "flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-zinc-500 dark:text-zinc-400"
                            }
                        >
                            <PhotoIcon className={"size-6"} />
                            <span className={"text-xs"}>
                                {!face.searched
                                    ? t("label.art-searching")
                                    : face.images.length === 0
                                      ? t("label.art-none")
                                      : t("label.art-unpicked")}
                            </span>
                        </span>
                    ) : (
                        <img
                            src={face.chosen.thumbnail_small}
                            alt={face.chosen.name}
                            loading={"lazy"}
                            className={"size-full object-cover"}
                        />
                    )}
                </button>

                {/* The copies, and the way off the order. Both on the picture
                    rather than under it: the tile is already card-shaped, and a
                    row of buttons beneath every one of a hundred cards is a
                    grid of buttons with cards in between. */}
                <div className={"pointer-events-none absolute inset-x-1 top-1 flex items-start justify-between gap-1"}>
                    <span
                        className={
                            "pointer-events-auto flex items-center gap-0.5 rounded-full bg-zinc-950/70 p-0.5 text-white backdrop-blur-sm"
                        }
                    >
                        <TileButton onClick={onFewer} label={t("accessibility.fewer-copies", { name: label })}>
                            <MinusIcon className={"size-3.5"} />
                        </TileButton>
                        <span className={"min-w-4 text-center text-xs tabular-nums"}>{copies}</span>
                        <TileButton onClick={onMore} label={t("accessibility.more-copies", { name: label })}>
                            <PlusIcon className={"size-3.5"} />
                        </TileButton>
                    </span>

                    <span className={"pointer-events-auto flex items-center gap-1"}>
                        {back !== null && (
                            <TileButton
                                onClick={() => setFlipped(!flipped)}
                                label={t("accessibility.flip-card", { name: label })}
                                framed={true}
                            >
                                <ArrowPathRoundedSquareIcon className={"size-3.5"} />
                            </TileButton>
                        )}
                        <TileButton
                            onClick={onDrop}
                            label={t("accessibility.drop-card", { name: label })}
                            framed={true}
                        >
                            <XMarkIcon className={"size-3.5"} />
                        </TileButton>
                    </span>
                </div>

                {/* Which of the found images this is, and the two steps to its
                    neighbours. Hidden while there is nothing to step through. */}
                {face.images.length > 1 && (
                    <div
                        className={
                            "absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-full bg-zinc-950/70 px-0.5 py-0.5 text-white backdrop-blur-sm"
                        }
                    >
                        <TileButton
                            onClick={() => onCycle(face, -1)}
                            label={t("accessibility.previous-art", { name: label })}
                        >
                            <ChevronLeftIcon className={"size-3.5"} />
                        </TileButton>
                        <button
                            type={"button"}
                            onClick={() => onBrowse(face, label)}
                            className={"min-w-0 truncate px-1 text-[11px] tabular-nums hover:underline"}
                            title={face.chosen?.name}
                        >
                            {`${at + 1}/${face.images.length}`}
                        </button>
                        <TileButton
                            onClick={() => onCycle(face, 1)}
                            label={t("accessibility.next-art", { name: label })}
                        >
                            <ChevronRightIcon className={"size-3.5"} />
                        </TileButton>
                    </div>
                )}
            </div>

            <figcaption className={"min-w-0"}>
                <span className={"block truncate text-xs font-medium text-zinc-950 dark:text-white"} title={label}>
                    {flipped && back !== null ? back.name : label}
                </span>
                <span className={"block truncate text-xs text-zinc-500 dark:text-zinc-400"} title={face.chosen?.name}>
                    {face.chosen === null ? t("label.art-none-short") : face.chosen.source}
                </span>
            </figcaption>
        </figure>
    );
}

/**
 * The properties for {@link TileButton}
 */
type TileButtonProps = {
    /** What it does */
    onClick: () => void;
    /** What it is called, for screen readers and as its tooltip */
    label: string;
    /** Whether it brings its own dark chip, for one that sits on artwork alone */
    framed?: boolean;
    /** The icon */
    children: React.ReactNode;
};

/**
 * One of the small controls that sit on a tile's artwork.
 *
 * Not the app's `Button`: those carry a text-sized hit area and a focus ring
 * built for a form, and eight of them on a card-sized picture is all chrome and
 * no card. This is the smallest control that is still comfortably tappable.
 *
 * @returns the button
 */
function TileButton({ onClick, label, framed = false, children }: TileButtonProps) {
    return (
        <button
            type={"button"}
            onClick={onClick}
            title={label}
            aria-label={label}
            className={clsx(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/25 focus:outline-2 focus:outline-offset-1 focus:outline-white",
                framed && "bg-zinc-950/70 backdrop-blur-sm",
            )}
        >
            {children}
        </button>
    );
}
