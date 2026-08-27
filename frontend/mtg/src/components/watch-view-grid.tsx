import { BellAlertIcon, CheckCircleIcon, EllipsisHorizontalIcon, SparklesIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import type { WatchListEntryResponse } from "src/api/generated";
import { finishLabel } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { WatchMatchBadges } from "src/components/watch-match-badges";
import type { WatchViewProps } from "src/components/watch-view";
import { formatCurrency } from "src/utils/format";
import { pointerCard } from "src/utils/use-pointer-card";
import { countEntry, entryState, pinnedFinish } from "src/utils/watch-list";
import type { WatchState } from "src/utils/watch-list";

/**
 * What each state does to a tile.
 *
 * A grid is read at a glance and from a distance, so the state has to be
 * carried by the whole tile rather than by a mark somewhere on it. Both themes
 * are spelled out here so a state cannot go invisible on one of them.
 */
const TILE: Record<WatchState, string> = {
    alarm: "ring-2 ring-amber-500 dark:ring-amber-400",
    cheap: "ring-1 ring-amber-500/40 dark:ring-amber-400/30",
    complete: "ring-1 ring-emerald-500/40 dark:ring-emerald-400/30",
    hunting: "ring-1 ring-zinc-950/5 hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/20",
};

/**
 * The properties for {@link WatchViewGrid}
 */
export type WatchViewGridProps = Pick<
    WatchViewProps,
    "entries" | "onEdit" | "onAcknowledge" | "onMatch" | "onLanguages" | "busy"
>;

/**
 * Artwork first, several to a row.
 *
 * For picking a card out of a list by its face rather than its name, which is
 * how most people remember cardboard. It carries the same controls as the card
 * view rather than only pictures: a grid you can look at but not touch sends
 * you back to another view for every change, which is worse than not having it.
 *
 * The only things it leaves out are the stacks and the two hints, both of which
 * are paragraphs and belong where there is a line to put them on.
 *
 * @returns the grid
 */
export function WatchViewGrid({ entries, onEdit, onAcknowledge, onMatch, onLanguages, busy }: WatchViewGridProps) {
    return (
        <ul className={"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}>
            {entries.map((entry) => (
                <Tile
                    key={entry.uuid}
                    entry={entry}
                    onEdit={onEdit}
                    onAcknowledge={onAcknowledge}
                    onMatch={onMatch}
                    onLanguages={onLanguages}
                    busy={busy === entry.uuid}
                />
            ))}
        </ul>
    );
}

/**
 * The properties for {@link Tile}
 */
type TileProps = Pick<WatchViewProps, "onEdit" | "onAcknowledge" | "onMatch" | "onLanguages"> & {
    /** The row this tile stands for */
    entry: WatchListEntryResponse;
    /** Whether a write is in flight for it */
    busy: boolean;
};

/**
 * One watched card in the grid
 *
 * @returns the tile
 */
function Tile({ entry, onEdit, onAcknowledge, onMatch, onLanguages, busy }: TileProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const count = countEntry(entry);
    const state = entryState(entry);
    const card = entry.card;
    const market = entry.market;
    // The stored finish is not the shown finish: it is only in force while the
    // version is pinned, and a sparkle on every tile said "foil" about rows
    // that take anything.
    const pinned = pinnedFinish(entry);

    return (
        <li
            {...pointerCard(entry.uuid)}
            className={clsx(
                "flex flex-col gap-2 overflow-hidden rounded-(--radius-card) bg-(--surface-card) p-2 transition",
                TILE[state],
                busy && "opacity-60",
            )}
        >
            {/* The artwork and the name are the one button: everything else on
                the tile does its own thing, and nesting those inside it would
                be invalid markup as well as unreachable by keyboard. */}
            <button
                type={"button"}
                disabled={busy}
                onClick={() => onEdit(entry)}
                className={"group/tile flex flex-col gap-2 text-left focus:outline-none"}
            >
                <span className={"relative block"}>
                    <CardThumbnail
                        name={card?.name ?? ""}
                        image={card?.image_normal ?? null}
                        thumbnail={card?.image_small ?? null}
                        sizes={"(min-width: 1280px) 12rem, (min-width: 640px) 16rem, 45vw"}
                        finish={pinned ?? "Nonfoil"}
                        className={"w-full rounded"}
                    />
                    {state === "alarm" && (
                        <span
                            className={
                                "absolute top-1 right-1 flex items-center gap-1 rounded-(--radius-pill) bg-amber-500 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white"
                            }
                        >
                            <BellAlertIcon className={"size-3"} />
                            {market == null ? t("label.alarm") : formatCurrency(market.price_cents / 100)}
                        </span>
                    )}
                    {state === "complete" && (
                        <CheckCircleIcon
                            aria-label={t("label.complete")}
                            className={
                                "absolute top-1 right-1 size-5 rounded-full bg-white text-emerald-600 dark:bg-zinc-900 dark:text-emerald-400"
                            }
                        />
                    )}
                </span>

                <span className={"flex min-w-0 flex-col gap-0.5"}>
                    <span className={"flex min-w-0 items-center gap-1"}>
                        <span className={"truncate text-xs font-medium text-zinc-950 dark:text-white"}>
                            {card?.name ?? t("label.unknown-printing")}
                        </span>
                        {pinned != null && pinned !== "Nonfoil" && (
                            <SparklesIcon
                                aria-label={finishLabel(tg, pinned)}
                                className={"size-3.5 shrink-0 text-amber-500 dark:text-amber-400"}
                            />
                        )}
                    </span>
                    <span className={"truncate text-[0.6875rem] text-zinc-500 dark:text-zinc-400"}>
                        {card == null
                            ? t("label.catalog-pending")
                            : `${card.set_code} ${card.collector_number} · ${card.lang.toUpperCase()}`}
                    </span>
                </span>
            </button>

            {/* The same meter as the card view, without its legend: a tile has
                no room for the words, and the bar alone still says whether this
                one is done. */}
            <span
                className={
                    "flex h-1 w-full gap-px overflow-hidden rounded-(--radius-pill) bg-zinc-950/5 dark:bg-white/10"
                }
            >
                <span className={"block h-full bg-emerald-500"} style={{ width: `${count.freeShare}%` }} />
                <span
                    className={"block h-full bg-emerald-500/30 dark:bg-emerald-500/40"}
                    style={{ width: `${count.sleevedShare}%` }}
                />
            </span>

            <span className={"flex items-baseline justify-between gap-1 text-xs"}>
                <span className={"text-zinc-500 tabular-nums dark:text-zinc-400"}>
                    {t("label.free-of-wanted", { free: count.free, wanted: Math.max(1, entry.wanted) })}
                </span>
                <span className={"font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                    {market == null ? "—" : formatCurrency(market.price_cents / 100)}
                </span>
            </span>

            <span className={"flex flex-wrap items-center gap-1"}>
                <WatchMatchBadges
                    exactPrinting={entry.exact_printing}
                    matchFinish={entry.match_finish}
                    finish={entry.finish}
                    finishes={card?.finishes ?? ""}
                    languages={entry.languages}
                    onLanguages={() => onLanguages(entry)}
                    busy={busy}
                    onChange={(patch) => onMatch(entry, patch)}
                />
            </span>

            {/* Pushed to the bottom, so the action rows of a grid line up even
                where one tile wraps its badges onto a second line and its
                neighbour does not. */}
            <span className={"mt-auto flex items-center gap-1 border-t border-zinc-950/5 pt-1 dark:border-white/10"}>
                {state === "alarm" && (
                    <Button plain disabled={busy} onClick={() => onAcknowledge(entry)} className={"text-xs!"}>
                        {t("button.acknowledge")}
                    </Button>
                )}
                <span className={"ml-auto flex items-center gap-1"}>
                    <CardmarketLink card={market ?? card} finish={pinned} />
                    <Button plain aria-label={t("button.edit-entry")} onClick={() => onEdit(entry)}>
                        <EllipsisHorizontalIcon />
                    </Button>
                </span>
            </span>
        </li>
    );
}
