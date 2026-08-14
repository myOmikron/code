import { TrashIcon } from "@heroicons/react/20/solid";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import type { TableSortDirection } from "components";
import type { EntrySort } from "src/api/generated";
import { useTranslation } from "react-i18next";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { CardmarketLink } from "src/components/cardmarket-link";
import { CardThumbnail } from "src/components/card-thumbnail";
import { unitPrice } from "src/components/card-view";
import { useCardLabels } from "src/components/card-labels";
import type { CardViewProps } from "src/components/card-view";
import { formatCurrency } from "src/utils/format";

/**
 * The table: no artwork, every number.
 *
 * The view for working on a collection rather than looking at it — comparing
 * prices down a column, checking what is worth what, spotting the one stack in
 * the wrong condition. Dropping the pictures is what buys the room for it.
 *
 * @returns the table
 */
export function CardViewTable({ entries, onInspect, onDelete, busy, sort, descending, onSort }: CardViewProps) {
    const [t] = useTranslation("collection");
    const labels = useCardLabels();

    /**
     * The props that make a header the sort control for its column
     *
     * Clicking the column already in use flips the direction; any other column
     * takes over ascending, which is what a reader means by "sort by this".
     *
     * @param key the order this column stands for
     *
     * @returns what to spread onto the header
     */
    function sortable(key: EntrySort) {
        return {
            sortable: true,
            direction: (sort === key ? (descending ? "desc" : "asc") : undefined) as TableSortDirection,
            onSort: () => onSort(key, sort === key ? !descending : false),
        };
    }

    return (
        // `--gutter: 0`, which is what the scroll wrapper's `-mx-(--gutter)`
        // reads: with a gutter the wrapper is wider than the column it sits in
        // and pushes the *page* sideways, so the table ends up with a scrollbar
        // and the browser with a second one over empty space. At zero it is
        // exactly as wide as its parent and scrolls only inside itself.
        //
        // Scrollable it has to stay: without the wrapper a table too wide for a
        // phone drags the page with it. And no `stickyHeader` — that sticks to
        // this box rather than to the page, which is not what it promises.
        <Table dense={true} striped={true} className={"[--gutter:0px]"}>
            <TableHead>
                <TableRow>
                    <TableHeader {...sortable("name")}>{t("label.card")}</TableHeader>
                    <TableHeader {...sortable("set")}>{t("label.set")}</TableHeader>
                    {/* Dropped in order of how little they carry as the window
                        narrows. Nothing is lost: the dialog a row opens shows
                        all of it. */}
                    <TableHeader className={"hidden lg:table-cell"} {...sortable("rarity")}>
                        {t("label.rarity")}
                    </TableHeader>
                    <TableHeader {...sortable("condition")}>{t("label.condition")}</TableHeader>
                    <TableHeader className={"hidden md:table-cell"}>{t("label.finish")}</TableHeader>
                    <TableHeader className={"text-right"} {...sortable("quantity")}>
                        {t("label.quantity")}
                    </TableHeader>
                    <TableHeader className={"hidden text-right sm:table-cell"} {...sortable("unit_price")}>
                        {t("label.unit-price")}
                    </TableHeader>
                    <TableHeader className={"text-right"} {...sortable("stack_value")}>
                        {t("label.stack-value")}
                    </TableHeader>
                    <TableHeader className={"w-0"}>
                        <span className={"sr-only"}>{t("button.open-on-cardmarket")}</span>
                    </TableHeader>
                    <TableHeader className={"w-0"}>
                        <span className={"sr-only"}>{t("accessibility.delete-entry")}</span>
                    </TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {entries.map((entry) => {
                    const card = entry.card;
                    const price = unitPrice(entry);

                    return (
                        <TableRow key={entry.uuid}>
                            <TableCell>
                                {/* The table trades the artwork for columns, so
                                    hovering a name is the only way back to the
                                    picture. Pure css: a sibling that is laid out
                                    but not painted until the name is pointed at,
                                    so there is no state to get stuck. */}
                                <span className={"group/peek relative"}>
                                    <button
                                        type={"button"}
                                        onClick={() => onInspect(entry)}
                                        className={
                                            "block max-w-36 truncate text-left font-medium hover:underline sm:max-w-56 lg:max-w-72"
                                        }
                                    >
                                        {card?.name ?? t("label.unknown-printing")}
                                    </button>
                                    {card?.image_normal != null && (
                                        <span
                                            aria-hidden={true}
                                            className={
                                                // `display: none` until hovered, not `invisible`.
                                                // A hidden-but-laid-out element still counts
                                                // towards the document's scroll overflow, and
                                                // under the last rows this one hung past the
                                                // bottom of the page — several hundred pixels
                                                // of empty scroll with nothing drawn in it.
                                                // That rules out fading it in: a transition
                                                // needs the element to be laid out.
                                                "pointer-events-none absolute top-full left-0 z-20 mt-2 hidden sm:group-hover/peek:block"
                                            }
                                        >
                                            <CardThumbnail
                                                name={card.name}
                                                image={card.image_normal}
                                                finish={entry.finish}
                                                className={"w-48 rounded-lg shadow-2xl ring-1 ring-black/25"}
                                            />
                                        </span>
                                    )}
                                </span>
                            </TableCell>
                            <TableCell>
                                <Text className={"text-xs whitespace-nowrap"}>
                                    {card != null ? `${card.set_code} #${card.collector_number}` : "—"}
                                </Text>
                            </TableCell>
                            <TableCell className={"hidden lg:table-cell"}>
                                <Text className={"text-xs"}>{card != null ? labels.rarity(card.rarity) : "—"}</Text>
                            </TableCell>
                            <TableCell>
                                <ConditionBadge condition={entry.condition} />
                            </TableCell>
                            <TableCell className={"hidden md:table-cell"}>
                                <FinishBadge finish={entry.finish} />
                            </TableCell>
                            <TableCell className={"text-right tabular-nums"}>{entry.quantity}</TableCell>
                            <TableCell className={"hidden text-right tabular-nums sm:table-cell"}>
                                {price === null ? "—" : formatCurrency(price)}
                            </TableCell>
                            <TableCell className={"text-right font-medium tabular-nums"}>
                                {price === null ? "—" : formatCurrency(price * entry.quantity)}
                            </TableCell>
                            <TableCell>
                                <CardmarketLink card={card} finish={entry.finish} />
                            </TableCell>
                            <TableCell>
                                <Button
                                    plain
                                    disabled={busy === entry.uuid}
                                    aria-label={t("accessibility.delete-entry")}
                                    onClick={() => onDelete(entry)}
                                >
                                    <TrashIcon className={"size-4"} />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
