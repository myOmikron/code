import { EllipsisHorizontalIcon, GlobeAltIcon, LinkIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Visibility } from "src/api/generated";
import type { CollectionOverviewResponse, RarityCountsResponse } from "src/api/generated";
import { CollectionIcon, CollectionMarker } from "src/components/collection-marker";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import type { MenuAt } from "src/components/context-menu";
import { ManaCost } from "src/components/mana-cost";
import { COLLECTION_FILL, collectionColor } from "src/utils/collection-style";
import { formatCurrency } from "src/utils/format";

/** What each visibility is drawn with */
export const VISIBILITY_ICON: Record<Visibility, ComponentType<{ className?: string }>> = {
    Public: GlobeAltIcon,
    Unlisted: LinkIcon,
    Private: LockClosedIcon,
};

/** The menu's order, from closed to open */
export const VISIBILITY_ORDER: Array<Visibility> = [Visibility.Private, Visibility.Unlisted, Visibility.Public];

/** What each visibility is called, as translation keys */
export const VISIBILITY_LABEL: Record<Visibility, string> = {
    Public: "label.visibility-public",
    Unlisted: "label.visibility-unlisted",
    Private: "label.visibility-private",
};

/**
 * The bar under a collection, in the ladder's order.
 *
 * The colours are the ones the cardboard itself uses: black for commons, silver
 * for uncommons, gold for rares and the mythic's burnt orange.
 */
const RARITY_BAR: Array<{ key: keyof RarityCountsResponse; label: string; bar: string }> = [
    { key: "common", label: "label.rarity-common", bar: "bg-zinc-500" },
    { key: "uncommon", label: "label.rarity-uncommon", bar: "bg-zinc-300" },
    { key: "rare", label: "label.rarity-rare", bar: "bg-amber-400" },
    { key: "mythic", label: "label.rarity-mythic", bar: "bg-orange-600" },
    { key: "other", label: "label.rarity-special", bar: "bg-violet-400" },
];

/**
 * The properties for {@link CollectionTile}
 */
export type CollectionTileProps = {
    /** The collection and what was counted in it */
    overview: CollectionOverviewResponse;
    /** Opens the page's menu on this collection, at a point */
    onMenu: (collection: CollectionOverviewResponse, at: MenuAt) => void;
};

/**
 * One collection, led by the best cards in it.
 *
 * A box is remembered by what is lying in it, so the two most valuable cards
 * fill the head of the tile the way a commander fills a deck's. An empty box
 * falls back to the colour and pictogram its owner gave it, and that marker
 * stays in front of the name either way, because it is what the shelf is sorted
 * by. Underneath, the colours and the rarity bar say what kind of box this is
 * without opening it.
 *
 * @returns the tile
 */
export function CollectionTile({ overview, onMenu }: CollectionTileProps) {
    const [t] = useTranslation("collection");
    const collection = overview.collection;
    const arts = overview.arts;
    const fill = COLLECTION_FILL[collectionColor(collection.color)];
    const colors = [...overview.colors];
    const VisibilityIcon = VISIBILITY_ICON[collection.visibility];
    const visibilityName: Record<Visibility, string> = {
        Public: t("label.visibility-public"),
        Unlisted: t("label.visibility-unlisted"),
        Private: t("label.visibility-private"),
    };
    const trigger = contextMenuTrigger((at) => onMenu(overview, at));

    return (
        <li
            {...trigger}
            className={clsx(
                "group/collection relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/25",
                CONTEXT_MENU_TARGET,
            )}
        >
            {/* Straight to the cards rather than to the collection's index: that
                one only redirects here, and a link through a redirect cannot
                preload what it will end up showing. */}
            <Link
                to={"/collections/$collectionUuid/cards"}
                params={{ collectionUuid: collection.uuid }}
                className={"block focus:outline-none"}
                aria-label={collection.name}
            >
                <div className={clsx("relative h-32 overflow-hidden sm:h-36", fill)}>
                    {arts.length > 1 ? (
                        <>
                            <span className={"absolute inset-0 [clip-path:polygon(0_0,52%_0,48%_100%,0_100%)]"}>
                                <img
                                    src={arts[0]}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 left-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                                    }
                                />
                            </span>
                            <span className={"absolute inset-0 [clip-path:polygon(52%_0,100%_0,100%_100%,48%_100%)]"}>
                                <img
                                    src={arts[1]}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                                    }
                                />
                            </span>
                            <svg
                                aria-hidden={true}
                                viewBox={"0 0 100 100"}
                                preserveAspectRatio={"none"}
                                className={
                                    "pointer-events-none absolute inset-0 z-1 h-full w-full overflow-visible text-white/75 drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]"
                                }
                            >
                                <line
                                    x1={52}
                                    y1={0}
                                    x2={48}
                                    y2={100}
                                    stroke={"currentColor"}
                                    strokeWidth={2}
                                    vectorEffect={"non-scaling-stroke"}
                                />
                            </svg>
                        </>
                    ) : arts.length === 1 ? (
                        <img
                            src={arts[0]}
                            crossOrigin={"anonymous"}
                            alt={""}
                            loading={"lazy"}
                            className={
                                "h-full w-full object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                            }
                        />
                    ) : (
                        <CollectionIcon
                            icon={collection.icon}
                            className={
                                "absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-[60%] text-white/25"
                            }
                        />
                    )}

                    <div
                        className={
                            "pointer-events-none absolute inset-0 bg-linear-to-t from-zinc-950/90 via-zinc-950/35 to-zinc-950/5"
                        }
                    />

                    <div className={"pointer-events-none absolute inset-x-4 bottom-3 flex items-end gap-2"}>
                        <CollectionMarker
                            color={collection.color}
                            icon={collection.icon}
                            size={"md"}
                            className={"outline-2 outline-white/40"}
                        />
                        <span className={"flex min-w-0 flex-1 flex-col"}>
                            <span className={"truncate text-base font-semibold text-white"}>{collection.name}</span>
                            {collection.description !== "" && (
                                <span className={"truncate text-xs text-white/75"}>{collection.description}</span>
                            )}
                        </span>
                        {colors.length > 0 && (
                            <span className={"shrink-0 rounded-(--radius-pill) bg-zinc-950/55 px-1.5 py-1"}>
                                <ManaCost value={colors.map((color) => `{${color}}`).join("")} />
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            <div className={"flex flex-col gap-1.5 px-4 py-3"}>
                <span className={"flex items-baseline gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                    <span className={"font-semibold text-zinc-950 tabular-nums dark:text-white"}>{overview.cards}</span>
                    <span className={"truncate"}>{t("label.total-cards")}</span>
                    {overview.price_eur_cents > 0 && (
                        <span className={"ml-auto shrink-0 tabular-nums"}>
                            {formatCurrency(overview.price_eur_cents / 100)}
                        </span>
                    )}
                </span>
                {/* What the box is made of. Copies the catalog knows a rarity
                    for; a box of nothing but unknown printings keeps the empty
                    rail, which is the honest answer. */}
                <span
                    className={"flex h-1 w-full gap-px overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}
                    title={RARITY_BAR.filter((segment) => overview.rarities[segment.key] > 0)
                        .map((segment) => `${t(segment.label)}: ${overview.rarities[segment.key]}`)
                        .join(" · ")}
                >
                    {RARITY_BAR.map((segment) => {
                        const copies = overview.rarities[segment.key];
                        if (copies === 0) return null;
                        return (
                            <span
                                key={segment.key}
                                className={clsx("block h-full", segment.bar)}
                                style={{ width: `${share(copies, overview.rarities)}%` }}
                            />
                        );
                    })}
                </span>
            </div>

            <button
                type={"button"}
                aria-label={t("button.collection-actions")}
                onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    onMenu(overview, { x: box.left, y: box.bottom + 4 });
                }}
                className={
                    "absolute top-2 right-2 rounded-full bg-zinc-950/55 p-1 text-white opacity-100 transition hover:bg-zinc-950/75 focus:opacity-100 sm:opacity-0 sm:group-focus-within/collection:opacity-100 sm:group-hover/collection:opacity-100"
                }
            >
                <EllipsisHorizontalIcon className={"size-5"} />
            </button>

            <span
                className={"absolute top-2 left-2 rounded-full bg-zinc-950/55 p-1 text-white"}
                title={visibilityName[collection.visibility]}
            >
                <VisibilityIcon className={"size-3.5"} />
            </span>
        </li>
    );
}

/**
 * How much of the rarity bar one segment takes
 *
 * @param copies the copies in this rarity
 * @param rarities every rarity in the collection
 *
 * @returns the percentage
 */
function share(copies: number, rarities: RarityCountsResponse): number {
    const total = RARITY_BAR.reduce((sum, segment) => sum + rarities[segment.key], 0);
    return total === 0 ? 0 : (copies / total) * 100;
}
