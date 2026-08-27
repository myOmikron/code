import {
    BellAlertIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    EllipsisHorizontalIcon,
    SparklesIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import type { WatchListEntryResponse, WatchedCopyResponse } from "src/api/generated";
import { finishLabel } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { pointerCard } from "src/utils/use-pointer-card";
import { WatchListCopies } from "src/components/watch-list-copies";
import { WatchMatchBadges } from "src/components/watch-match-badges";
import type { WatchMatchPatch } from "src/utils/watch-list";
import { WatchStockMeter } from "src/components/watch-stock-meter";
import { formatCurrency } from "src/utils/format";
import { countEntry, entryState, pinnedFinish } from "src/utils/watch-list";
import type { WatchState } from "src/utils/watch-list";

/**
 * The ink each state wears.
 *
 * One rail down the left edge rather than a badge in the corner: a want list is
 * scanned vertically with a thumb, and an edge is the only thing that stays
 * readable while the rest of the card is moving. Every colour is declared for
 * both themes here rather than left to a `dark:` further down, so a state can
 * never end up invisible on one of them.
 */
const RAIL: Record<WatchState, string> = {
    alarm: "bg-amber-500",
    cheap: "bg-amber-500/40",
    complete: "bg-emerald-500",
    hunting: "bg-zinc-300 dark:bg-zinc-700",
};

/** How the price reads per state */
const PRICE_INK: Record<WatchState, string> = {
    alarm: "text-amber-600 dark:text-amber-400",
    cheap: "text-amber-600 dark:text-amber-400",
    complete: "text-zinc-500 dark:text-zinc-400",
    hunting: "text-zinc-950 dark:text-white",
};

/**
 * The properties for {@link WatchListEntryCard}
 */
export type WatchListEntryCardProps = {
    /** The entry this card is about */
    entry: WatchListEntryResponse;
    /** Opens the entry for editing */
    onEdit: (entry: WatchListEntryResponse) => void;
    /** Marks a standing alarm as read */
    onAcknowledge: (entry: WatchListEntryResponse) => void;
    /** Changes what the row counts */
    onMatch: (entry: WatchListEntryResponse, patch: WatchMatchPatch) => void;
    /** Opens the language picker */
    onLanguages: (entry: WatchListEntryResponse) => void;
    /** Opens or closes the stacks under the row */
    onToggleCopies: (entry: WatchListEntryResponse) => void;
    /** Whether the stacks are unfolded */
    open: boolean;
    /** The stacks, `null` while they are still on their way */
    copies: Array<WatchedCopyResponse> | null;
    /** Whether a write is in flight for this entry */
    busy?: boolean;
};

/**
 * One card on a watch list.
 *
 * Three questions, in the order somebody standing in a shop asks them: do I
 * already have this, what does it cost, and is that cheap enough to act on. So
 * the card is three bands — who it is, how far along it is, and what it costs —
 * and the state rides the left edge where it survives the scroll.
 *
 * Everything is one column on a phone and stays one column: a want list is read
 * top to bottom with one thumb, and the two side-by-side halves this used to
 * have collided somewhere around a 360px screen.
 *
 * @returns the card
 */
export function WatchListEntryCard({
    entry,
    onEdit,
    onAcknowledge,
    onMatch,
    onLanguages,
    onToggleCopies,
    open,
    copies,
    busy = false,
}: WatchListEntryCardProps) {
    const [t] = useTranslation("watch-list");
    const [tg] = useTranslation();
    const count = countEntry(entry);
    const state = entryState(entry);
    const card = entry.card;
    const market = entry.market;
    // The stored finish is not the shown finish: it is only in force while the
    // version is pinned, and the sparkle used to claim "foil" about rows that
    // take anything.
    const pinned = pinnedFinish(entry);
    const threshold = entry.alarm_price_cents;

    return (
        <li
            {...pointerCard(entry.uuid)}
            className={clsx(
                "shadow-card-sm relative flex flex-col gap-3 overflow-hidden rounded-(--radius-card) bg-(--surface-card) py-3 pr-3 pl-4 ring-1 transition sm:py-4 sm:pr-4 sm:pl-5",
                state === "alarm"
                    ? "ring-amber-500/40 dark:ring-amber-400/30"
                    : "ring-zinc-950/5 hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/20",
            )}
        >
            <span aria-hidden={true} className={clsx("absolute inset-y-0 left-0 w-1", RAIL[state])} />

            {/* Who it is, and what it costs. The price sits at the top right
                because that is where a shelf label is read, and it is the one
                number that decides whether the rest of the card matters. */}
            <div className={"flex items-start gap-3"}>
                <CardThumbnail
                    name={card?.name ?? ""}
                    image={card?.image_normal ?? null}
                    thumbnail={card?.image_small ?? null}
                    sizes={"(min-width: 640px) 5.5rem, 4.5rem"}
                    finish={pinned ?? "Nonfoil"}
                    className={"w-18 shrink-0 rounded-md sm:w-22"}
                />

                <div className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                    <div className={"flex min-w-0 items-center gap-1.5"}>
                        <h3 className={"truncate text-base font-semibold text-zinc-950 dark:text-white"}>
                            {card?.name ?? t("label.unknown-printing")}
                        </h3>
                        {pinned != null && pinned !== "Nonfoil" && (
                            <SparklesIcon
                                aria-label={finishLabel(tg, pinned)}
                                className={"size-4 shrink-0 text-amber-500 dark:text-amber-400"}
                            />
                        )}
                        {state === "complete" && (
                            <CheckCircleIcon
                                aria-label={t("label.complete")}
                                className={"size-4 shrink-0 text-emerald-600 dark:text-emerald-400"}
                            />
                        )}
                    </div>
                    <p className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                        {card == null
                            ? t("label.catalog-pending")
                            : `${card.set_name} · ${card.collector_number} · ${card.lang.toUpperCase()}`}
                    </p>
                    {/* Only where the two differ, which is exactly when the
                        price above is about a card other than the one named. */}
                    {market != null && market.printing !== entry.printing && (
                        <p className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                            {t("label.priced-as", {
                                set: market.set_code,
                                number: market.collector_number,
                                lang: market.lang.toUpperCase(),
                            })}
                        </p>
                    )}
                </div>

                <div className={"flex shrink-0 flex-col items-end gap-0.5"}>
                    <span className={clsx("text-sm font-semibold tabular-nums", PRICE_INK[state])}>
                        {market == null ? "—" : formatCurrency(market.price_cents / 100)}
                    </span>
                    {threshold != null && (
                        <span className={"text-[0.6875rem] text-zinc-500 tabular-nums dark:text-zinc-400"}>
                            {t("label.alarm-set", { price: formatCurrency(threshold / 100) })}
                        </span>
                    )}
                </div>
            </div>

            {/* An alarm is news, so it gets a band of its own rather than a
                badge among badges. It is also the only thing on the card with a
                button attached, which is what makes it read as something to
                deal with. */}
            {(state === "alarm" || state === "cheap") && (
                <div
                    className={clsx(
                        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-(--radius-control) px-2.5 py-2",
                        state === "alarm" ? "bg-amber-400/20 dark:bg-amber-400/10" : "bg-zinc-950/5 dark:bg-white/5",
                    )}
                >
                    <BellAlertIcon className={"size-4 shrink-0 text-amber-600 dark:text-amber-400"} />
                    <span className={"min-w-0 flex-1 text-xs text-zinc-700 dark:text-zinc-300"}>
                        {entry.triggered_price_cents == null
                            ? t("label.alarm")
                            : t("label.triggered", { price: formatCurrency(entry.triggered_price_cents / 100) })}
                    </span>
                    {!entry.acknowledged && (
                        <Button plain disabled={busy} onClick={() => onAcknowledge(entry)} className={"shrink-0"}>
                            {t("button.acknowledge")}
                        </Button>
                    )}
                </div>
            )}

            {/* The meter is the disclosure: the numbers on it are exactly the
                question the stacks underneath answer, so there is nothing to
                label and nothing extra to aim at. */}
            {count.total > 0 ? (
                <button
                    type={"button"}
                    aria-expanded={open}
                    onClick={() => onToggleCopies(entry)}
                    className={
                        "-mx-1 rounded-(--radius-control) px-1 py-0.5 text-left transition hover:bg-zinc-950/5 dark:hover:bg-white/5"
                    }
                >
                    <WatchStockMeter
                        count={count}
                        wanted={entry.wanted}
                        chevron={
                            <ChevronDownIcon className={clsx("size-4 shrink-0 transition", open ? "rotate-180" : "")} />
                        }
                    />
                </button>
            ) : (
                <WatchStockMeter count={count} wanted={entry.wanted} />
            )}

            {open && (
                <div className={"rounded-(--radius-control) bg-zinc-950/3 p-2.5 dark:bg-white/5"}>
                    <WatchListCopies copies={copies} />
                </div>
            )}

            {/* What the switches are turning away, said only where they are
                actually turning something away. Beats sending somebody shopping
                for a card in the next collection over, in the wrong edition. */}
            {(count.otherPrinting > 0 || count.otherFinish > 0) && (
                <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                    {count.otherPrinting > 0 && t("label.other-printing", { count: count.otherPrinting })}
                    {count.otherPrinting > 0 && count.otherFinish > 0 && " · "}
                    {count.otherFinish > 0 && t("label.other-finish", { count: count.otherFinish })}
                </p>
            )}

            {entry.note !== "" && <p className={"text-xs text-zinc-600 italic dark:text-zinc-400"}>{entry.note}</p>}

            <div className={"flex flex-wrap items-center gap-2"}>
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

                <span className={"ml-auto flex shrink-0 items-center gap-1"}>
                    {/* The link follows the price, not the name on the row: under
                        "any version" the number quoted above belongs to the
                        cheapest print, and opening the one the entry happens to
                        be named after would show a different figure. */}
                    <CardmarketLink card={market ?? card} finish={pinned} />
                    <Button plain aria-label={t("button.edit-entry")} onClick={() => onEdit(entry)}>
                        <EllipsisHorizontalIcon />
                    </Button>
                </span>
            </div>

            {/* About the print the link opens, which is the priced one. */}
            {market != null && market.cardmarket_id == null && (
                <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("description.no-cardmarket-product")}</p>
            )}
        </li>
    );
}
