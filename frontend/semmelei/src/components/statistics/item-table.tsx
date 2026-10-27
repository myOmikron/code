import React from "react";
import { useTranslation } from "react-i18next";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import { formatPrice } from "src/utils/price";
import { ItemColumn, ItemRow, sortItemRows } from "src/utils/statistics";

const NUMBER = new Intl.NumberFormat("de-DE");
const NUMERIC_COLUMNS: Exclude<ItemColumn, "name">[] = [
    "units",
    "orders",
    "orderValueCents",
    "cancelledUnits",
    "calledOffUnits",
];
const COLUMN_LABELS: Record<Exclude<ItemColumn, "name">, string> = {
    units: "label.units",
    orders: "label.orders",
    orderValueCents: "label.order-value",
    cancelledUnits: "label.cancelled-units",
    calledOffUnits: "label.called-off-units",
};

/** The properties of {@link ItemTable} */
export type ItemTableProps = {
    /** The rows */
    rows: ItemRow[];
};

/**
 * Sortable table of every active Item and every Item ordered in the period, deleted Items marked
 *
 * @returns the table
 */
export function ItemTable(props: ItemTableProps) {
    const [t] = useTranslation("statistics");
    const [sort, setSort] = React.useState<{ column: ItemColumn; direction: "asc" | "desc" }>({
        column: "units",
        direction: "desc",
    });
    const rows = React.useMemo(() => sortItemRows(props.rows, sort.column, sort.direction), [props.rows, sort]);

    const header = (column: ItemColumn, label: string, className?: string) => (
        <TableHeader
            className={className}
            sortable
            direction={sort.column === column ? sort.direction : undefined}
            onSort={() =>
                setSort((current) => ({
                    column,
                    direction:
                        current.column === column
                            ? current.direction === "asc"
                                ? "desc"
                                : "asc"
                            : column === "name"
                              ? "asc"
                              : "desc",
                }))
            }
        >
            {label}
        </TableHeader>
    );

    return (
        <Table dense>
            <TableHead>
                <TableRow>
                    {header("name", t("label.item"))}
                    <TableHeader>{t("label.category")}</TableHeader>
                    {NUMERIC_COLUMNS.map((column) => (
                        <React.Fragment key={column}>
                            {header(column, t(COLUMN_LABELS[column]), "text-right")}
                        </React.Fragment>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell>
                            <span className={"flex items-center gap-2"}>
                                {row.name}
                                {row.deleted && <Badge color={"zinc"}>{t("label.deleted")}</Badge>}
                            </span>
                        </TableCell>
                        <TableCell>{row.category?.name ?? ""}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{NUMBER.format(row.units)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{NUMBER.format(row.orders)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{formatPrice(row.orderValueCents)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{NUMBER.format(row.cancelledUnits)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{NUMBER.format(row.calledOffUnits)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
