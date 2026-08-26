import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DeckCardResponse, DeckResponse } from "src/api/generated";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { deckRuleZero } from "src/utils/deck-rules";
import { readTargets } from "src/utils/deck-targets";
import { useDeckAnalysis } from "src/utils/use-deck-analysis";

/**
 * The properties for {@link DeckResourceBalance}
 */
export type DeckResourceBalanceProps = {
    /** Every slot of the deck, as the loader holds them */
    cards: Array<DeckCardResponse>;
    /** The deck itself, for its colours, bracket and agreed size */
    deck: DeckResponse;
    /** How many cards the format asks for, when the table agreed no size of its own */
    formatSize?: number | null;
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
 * It sits with the statistics rather than with the advice, which is where it
 * belongs: it states what the list is made of and asks nothing of the reader,
 * while every panel on the advisor tab is an argument they are meant to act
 * on. Coming from the graph, it renders nothing at all when the advisor is
 * unreachable or the deck is not a Commander deck — a statistics page must
 * never turn into an outage report for a second backend.
 *
 * The resource names are the graph's own vocabulary and stay untranslated,
 * like card names.
 *
 * @returns the panel, or nothing while there is no answer
 */
export function DeckResourceBalance({ cards, deck, formatSize }: DeckResourceBalanceProps) {
    const [t] = useTranslation("deck");

    const target = deckRuleZero(deck).deckSize ?? formatSize ?? null;
    const advisor = useMemo(
        () => advisorDeck(cards, { allowedColorIdentity: deck.allowed_color_identity, targetSize: target }),
        [cards, deck.allowed_color_identity, target],
    );
    // The same request the advisor tab makes, targets included, so opening
    // both costs one analysis rather than two — the query keys on the question
    // asked, not on the page asking it. The balance itself does not move with
    // a target, but a second key would recompute the whole report to learn
    // that.
    const targets = useMemo(() => readTargets(deck.uuid), [deck.uuid]);
    const analysis = useDeckAnalysis(advisor, bracketSpeed(deck.bracket), deck.format === "commander", targets);
    const balance = analysis.data?.balance ?? [];

    if (balance.length === 0) return null;

    return (
        <section
            className={
                "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
            aria-busy={analysis.stale}
        >
            <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.balance")}</h3>
            <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.balance")}</p>
            <div className={"mt-4 max-h-96 overflow-y-auto"}>
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
            </div>
        </section>
    );
}
