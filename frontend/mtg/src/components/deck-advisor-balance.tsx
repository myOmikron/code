import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import { useTranslation } from "react-i18next";
import { ResourceBalance } from "src/api/graph-generated";

/**
 * The properties for {@link DeckAdvisorBalance}
 */
export type DeckAdvisorBalanceProps = {
    /** The balance rows as the advisor reports them */
    balance: Array<ResourceBalance>;
};

/**
 * Formats a weighted count without a pointless `.0`
 *
 * @param value the count, possibly fractional
 *
 * @returns the count with at most one decimal
 */
function count(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * What the deck produces against what it wants to consume, per resource.
 *
 * A table rather than a chart: this is the "9 cards care about artifacts and
 * 3 make them" read, and the numbers are the point. The gap column carries
 * its sign, so the direction survives without colour.
 *
 * The resource names are the graph's own vocabulary and stay untranslated,
 * like card names.
 *
 * @returns the table
 */
export function DeckAdvisorBalance({ balance }: DeckAdvisorBalanceProps) {
    const [t] = useTranslation("advisor");

    return (
        <Table dense={true} className={"[--gutter:--spacing(4)]"}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.resource")}</TableHeader>
                    <TableHeader className={"text-right"}>{t("label.produced")}</TableHeader>
                    <TableHeader className={"text-right"}>{t("label.wanted")}</TableHeader>
                    <TableHeader className={"text-right"}>{t("label.gap")}</TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {balance.map((row) => (
                    <TableRow key={row.resource}>
                        <TableCell className={"font-medium"}>
                            <span className={"flex items-center gap-2"}>
                                {row.resource.replace(/_/g, " ")}
                                {/* Why a row's gap can be smaller than its two
                                    columns imply: the commander is counted as
                                    the several cards its reliability is worth,
                                    and a number the reader cannot derive has to
                                    say where it came from. */}
                                {row.from_commander === true && (
                                    <Badge color={"blue"}>{t("label.from-commander")}</Badge>
                                )}
                            </span>
                        </TableCell>
                        <TableCell className={"text-right tabular-nums"}>{count(row.produced)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>{count(row.wanted)}</TableCell>
                        <TableCell className={"text-right tabular-nums"}>
                            {row.gap > 0 ? `+${count(row.gap)}` : count(row.gap)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
