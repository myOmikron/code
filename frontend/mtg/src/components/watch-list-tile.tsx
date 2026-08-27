import { BellAlertIcon, EllipsisHorizontalIcon } from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { WatchListOverviewResponse, WatchedRaritiesResponse } from "src/api/generated";
import { CollectionIcon, CollectionMarker } from "src/components/collection-marker";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import type { MenuAt } from "src/components/context-menu";
import { ManaCost } from "src/components/mana-cost";
import { COLLECTION_FILL, collectionColor } from "src/utils/collection-style";
import { formatCurrency } from "src/utils/format";

/**
 * The bar under a watch list, in the ladder's order.
 *
 * The same colours the collection tile uses, because it is the same fact about
 * the same cardboard: black for commons, silver for uncommons, gold for rares
 * and the mythic's burnt orange.
 */
const RARITY_BAR: Array<{ key: keyof WatchedRaritiesResponse; label: string; bar: string }> = [
    { key: "common", label: "label.rarity-common", bar: "bg-zinc-500" },
    { key: "uncommon", label: "label.rarity-uncommon", bar: "bg-zinc-300" },
    { key: "rare", label: "label.rarity-rare", bar: "bg-amber-400" },
    { key: "mythic", label: "label.rarity-mythic", bar: "bg-orange-600" },
    { key: "other", label: "label.rarity-special", bar: "bg-violet-400" },
];

/**
 * The properties for {@link WatchListTile}
 */
export type WatchListTileProps = {
    /** The list and what was counted on it */
    overview: WatchListOverviewResponse;
    /** Opens the page's menu on this list, at a point */
    onMenu: (overview: WatchListOverviewResponse, at: MenuAt) => void;
    /** Whether keyboard navigation currently points at this list */
    selected?: boolean;
    /** Records pointer or focus arriving on this list */
    onActivate?: () => void;
};

/**
 * One watch list, led by the dearest cards on it.
 *
 * Built like a collection's tile on purpose: the grid of shelves and the grid
 * of want lists sit one navigation entry apart, and a reader should not have to
 * learn two ways of reading the same rectangle. What differs is only what the
 * numbers count. A collection says what it holds and what that is worth; a
 * watch list says what is still missing and what that would cost, which is the
 * question a want list is opened with.
 *
 * @returns the tile
 */
export function WatchListTile({ overview, onMenu, selected = false, onActivate }: WatchListTileProps) {
    const [t] = useTranslation("watch-list");
    const { list, arts, missing, unread } = overview;
    const fill = COLLECTION_FILL[collectionColor(list.color)];
    const colors = [...overview.colors];
    const trigger = contextMenuTrigger((at) => onMenu(overview, at));
    const tile = useRef<HTMLLIElement>(null);

    useEffect(() => {
        if (selected) tile.current?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    return (
        <li
            ref={tile}
            onMouseEnter={onActivate}
            {...trigger}
            className={clsx(
                selected
                    ? "group/watch-list relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) ring-2 ring-(--color-brand-500) transition"
                    : "group/watch-list relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/25",
                CONTEXT_MENU_TARGET,
            )}
        >
            <Link
                to={"/watch-lists/$watchListUuid"}
                params={{ watchListUuid: list.uuid }}
                className={"block focus:outline-none"}
                aria-label={list.name}
                onFocus={onActivate}
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
                                        "absolute inset-y-0 left-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/watch-list:scale-105"
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
                                        "absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/watch-list:scale-105"
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
                                "h-full w-full object-cover object-[center_22%] transition duration-500 group-hover/watch-list:scale-105"
                            }
                        />
                    ) : (
                        <CollectionIcon
                            icon={list.icon}
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
                            color={list.color}
                            icon={list.icon}
                            size={"md"}
                            className={"outline-2 outline-white/40"}
                        />
                        <span className={"flex min-w-0 flex-1 flex-col"}>
                            <span className={"truncate text-base font-semibold text-white"}>{list.name}</span>
                            {list.description !== "" && (
                                <span className={"truncate text-xs text-white/75"}>{list.description}</span>
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
                    <span className={"font-semibold text-zinc-950 tabular-nums dark:text-white"}>{missing}</span>
                    <span className={"truncate"}>{t("label.still-missing")}</span>
                    {overview.price_eur_cents > 0 && (
                        <span className={"ml-auto shrink-0 tabular-nums"}>
                            {formatCurrency(overview.price_eur_cents / 100)}
                        </span>
                    )}
                </span>
                {/* What the list is made of, by wanted copies. Entries whose
                    printing the catalog does not know yet keep the rail empty,
                    which is the honest answer. */}
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
                aria-label={t("button.watch-list-actions")}
                onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    onMenu(overview, { x: box.left, y: box.bottom + 4 });
                }}
                className={
                    "absolute top-2 right-2 rounded-full bg-zinc-950/55 p-1 text-white opacity-100 transition hover:bg-zinc-950/75 focus:opacity-100 sm:opacity-0 sm:group-focus-within/watch-list:opacity-100 sm:group-hover/watch-list:opacity-100"
                }
            >
                <EllipsisHorizontalIcon className={"size-5"} />
            </button>

            {/* Where a collection wears its visibility, a watch list wears its
                alarms: it is the one thing about a list that changes without
                anybody touching it. */}
            {unread > 0 && (
                <span
                    className={
                        "absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-1 text-xs font-semibold text-white tabular-nums"
                    }
                    title={t("label.unread-alarms", { count: unread })}
                >
                    <BellAlertIcon className={"size-3.5"} />
                    {unread}
                </span>
            )}
        </li>
    );
}

/**
 * How much of the rarity bar one segment takes
 *
 * @param copies the wanted copies in this rarity
 * @param rarities every rarity on the list
 *
 * @returns the percentage
 */
function share(copies: number, rarities: WatchedRaritiesResponse): number {
    const total = RARITY_BAR.reduce((sum, segment) => sum + rarities[segment.key], 0);
    return total === 0 ? 0 : (copies / total) * 100;
}
