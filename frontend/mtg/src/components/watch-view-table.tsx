import { BellAlertIcon, CheckCircleIcon, EllipsisHorizontalIcon } from "@heroicons/react/20/solid";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import type { TableSortDirection } from "components";
import { useTranslation } from "react-i18next";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { WatchMatchBadges } from "src/components/watch-match-badges";
import type { WatchViewProps } from "src/components/watch-view";
import { formatCurrency } from "src/utils/format";
import { pointerCard } from "src/utils/use-pointer-card";
import { countEntry, entryState, pinnedFinish } from "src/utils/watch-list";
import type { WatchSort } from "src/utils/watch-list";

/**
 * The properties for {@link WatchViewTable}
 */
export type WatchViewTableProps = Pick<
    WatchViewProps,
    "entries" | "onEdit" | "onAcknowledge" | "onMatch" | "onLanguages" | "busy"
> & {
    /** What the list is ordered by, so the column can mark itself */
    sort: WatchSort;
    /** Whether that order is reversed */
    descending: boolean;
    /** Asks for a different order */
    onSort: (sort: WatchSort, descending: boolean) => void;
};

/**
 * Every row, every number, no room wasted.
 *
 * The view for planning a purchase rather than hunting one card: prices down a
 * column, what is missing beside them, and the columns sort. The artwork
 * shrinks to a stamp because at this density it is a way of recognising a row,
 * not something to look at.
 *
 * Scrolls sideways inside its own box on a narrow screen instead of squeezing —
 * a table that fits a phone by dropping columns is a worse card view.
 *
 * @returns the table
 */
export function WatchViewTable({
    entries,
    onEdit,
    onAcknowledge,
    onMatch,
    onLanguages,
    busy,
    sort,
    descending,
    onSort,
}: WatchViewTableProps) {
    const [t] = useTranslation("watch-list");

    /**
     * What a sortable header needs to know about itself
     *
     * @param key the order this column sets
     *
     * @returns the props for the header
     */
    function sortable(key: WatchSort) {
        return {
            sortable: true,
            direction: (sort === key ? (descending ? "desc" : "asc") : undefined) as TableSortDirection,
            onSort: () => onSort(key, sort === key ? !descending : false),
        };
    }

    return (
        <Table dense={true} className={"[--gutter:--spacing(3)]"}>
            <TableHead>
                <TableRow>
                    <TableHeader className={"w-10"} />
                    <TableHeader {...sortable("name")}>{t("label.column-card")}</TableHeader>
                    <TableHeader>{t("label.column-counts")}</TableHeader>
                    <TableHeader {...sortable("missing")} className={"text-right"}>
                        {t("label.still-missing")}
                    </TableHeader>
                    <TableHeader {...sortable("price")} className={"text-right"}>
                        {t("label.market-price")}
                    </TableHeader>
                    <TableHeader className={"w-24"} />
                </TableRow>
            </TableHead>
            <TableBody>
                {entries.map((entry) => {
                    const count = countEntry(entry);
                    const state = entryState(entry);
                    const card = entry.card;
                    const market = entry.market;
                    const pinned = pinnedFinish(entry);

                    return (
                        <TableRow key={entry.uuid} {...pointerCard(entry.uuid)}>
                            <TableCell>
                                <CardThumbnail
                                    name={card?.name ?? ""}
                                    image={card?.image_small ?? null}
                                    sizes={"2.5rem"}
                                    finish={pinned ?? "Nonfoil"}
                                    compact={true}
                                    className={"w-10 rounded"}
                                />
                            </TableCell>

                            <TableCell>
                                <div className={"flex flex-col gap-1"}>
                                    <span className={"flex items-center gap-1.5"}>
                                        <span className={"font-medium text-zinc-950 dark:text-white"}>
                                            {card?.name ?? t("label.unknown-printing")}
                                        </span>
                                        {state === "complete" && (
                                            <CheckCircleIcon
                                                aria-label={t("label.complete")}
                                                className={"size-4 text-emerald-600 dark:text-emerald-400"}
                                            />
                                        )}
                                    </span>
                                    <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                        {card == null
                                            ? t("label.catalog-pending")
                                            : `${card.set_code} ${card.collector_number} · ${card.lang.toUpperCase()}`}
                                    </span>
                                    <span className={"flex flex-wrap items-center gap-1"}>
                                        <WatchMatchBadges
                                            exactPrinting={entry.exact_printing}
                                            matchFinish={entry.match_finish}
                                            finish={entry.finish}
                                            finishes={card?.finishes ?? ""}
                                            languages={entry.languages}
                                            onLanguages={() => onLanguages(entry)}
                                            busy={busy === entry.uuid}
                                            onChange={(patch) => onMatch(entry, patch)}
                                        />
                                    </span>
                                </div>
                            </TableCell>

                            <TableCell className={"tabular-nums"}>
                                <div className={"flex flex-col gap-0.5 text-xs"}>
                                    <span className={"text-zinc-950 dark:text-white"}>
                                        {t("label.free-of-wanted", {
                                            free: count.free,
                                            wanted: Math.max(1, entry.wanted),
                                        })}
                                    </span>
                                    {count.sleeved > 0 && (
                                        <span className={"text-zinc-500 dark:text-zinc-400"}>
                                            {t("label.in-decks", { count: count.sleeved })}
                                        </span>
                                    )}
                                </div>
                            </TableCell>

                            <TableCell className={"text-right tabular-nums"}>
                                {count.missing === 0 ? (
                                    <span className={"text-zinc-400 dark:text-zinc-500"}>—</span>
                                ) : (
                                    count.missing
                                )}
                            </TableCell>

                            <TableCell className={"text-right"}>
                                <div className={"flex flex-col items-end gap-0.5"}>
                                    <span
                                        className={
                                            state === "alarm" || state === "cheap"
                                                ? "font-semibold text-amber-600 tabular-nums dark:text-amber-400"
                                                : "text-zinc-950 tabular-nums dark:text-white"
                                        }
                                    >
                                        {market == null ? "—" : formatCurrency(market.price_cents / 100)}
                                    </span>
                                    {entry.alarm_price_cents != null && (
                                        <span className={"text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                            {t("label.alarm-set", {
                                                price: formatCurrency(entry.alarm_price_cents / 100),
                                            })}
                                        </span>
                                    )}
                                </div>
                            </TableCell>

                            <TableCell>
                                <div className={"flex items-center justify-end gap-1"}>
                                    {state === "alarm" && (
                                        <Badge color={"amber"} className={"cursor-pointer"}>
                                            <button type={"button"} onClick={() => onAcknowledge(entry)}>
                                                <BellAlertIcon className={"size-3.5"} />
                                            </button>
                                        </Badge>
                                    )}
                                    <CardmarketLink card={market ?? card} finish={pinned} />
                                    <Button plain aria-label={t("button.edit-entry")} onClick={() => onEdit(entry)}>
                                        <EllipsisHorizontalIcon />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
