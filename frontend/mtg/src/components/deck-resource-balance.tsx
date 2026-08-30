import { InformationCircleIcon } from "@heroicons/react/20/solid";
import {
    Badge,
    Dropdown,
    DropdownButton,
    DropdownHeader,
    DropdownMenu,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DeckCardResponse, DeckResponse } from "src/api/generated";
import { advisorDeck, bracketSpeed } from "src/utils/deck-advisor";
import { deckRuleZero } from "src/utils/deck-rules";
import { resourceLabel } from "src/utils/graph-vocabulary";
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
 * like card names — only their casing is dressed up for display. Each count
 * opens onto the cards it is counting, so no number here has to be taken on
 * faith.
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
            <div className={"mt-4 max-h-96 overflow-y-auto"}>
                <Table dense={true} className={"[--gutter:--spacing(2)] sm:[--gutter:--spacing(4)]"}>
                    <TableHead>
                        <TableRow>
                            <TableHeader className={"max-sm:px-2 max-sm:whitespace-normal"}>
                                <span className={"flex items-center gap-1"}>
                                    {t("label.resource")}
                                    <Dropdown>
                                        <DropdownButton
                                            as={"button"}
                                            type={"button"}
                                            aria-label={t("accessibility.balance-info")}
                                            className={
                                                "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                                            }
                                        >
                                            <InformationCircleIcon className={"size-4"} />
                                        </DropdownButton>
                                        <DropdownMenu anchor={"bottom start"} className={"max-w-72"}>
                                            <DropdownHeader>
                                                <p className={"text-xs/5 font-normal text-zinc-500 dark:text-zinc-400"}>
                                                    {t("description.balance")}
                                                </p>
                                            </DropdownHeader>
                                        </DropdownMenu>
                                    </Dropdown>
                                </span>
                            </TableHeader>
                            <TableHeader className={"text-right max-sm:px-2 max-sm:whitespace-normal"}>
                                {t("label.produced")}
                            </TableHeader>
                            <TableHeader className={"text-right max-sm:px-2 max-sm:whitespace-normal"}>
                                {t("label.wanted")}
                            </TableHeader>
                            <TableHeader className={"text-right max-sm:px-2 max-sm:whitespace-normal"}>
                                {t("label.gap")}
                            </TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {balance.map((row) => (
                            <TableRow key={row.resource}>
                                <TableCell className={"font-medium max-sm:px-2 max-sm:whitespace-normal"}>
                                    <span className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                                        {resourceLabel(row.resource)}
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
                                <TableCell className={"text-right tabular-nums max-sm:px-2"}>
                                    <BalanceCardCount
                                        count={count(row.produced)}
                                        cards={row.produced_cards ?? []}
                                        label={t("accessibility.balance-produced-cards", {
                                            resource: resourceLabel(row.resource),
                                        })}
                                    />
                                </TableCell>
                                <TableCell className={"text-right tabular-nums max-sm:px-2"}>
                                    <BalanceCardCount
                                        count={count(row.wanted)}
                                        cards={row.wanted_cards ?? []}
                                        label={t("accessibility.balance-wanted-cards", {
                                            resource: resourceLabel(row.resource),
                                        })}
                                    />
                                </TableCell>
                                <TableCell className={"text-right tabular-nums max-sm:px-2"}>
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

/**
 * The properties for {@link BalanceCardCount}
 */
type BalanceCardCountProps = {
    /** The count as already formatted for display */
    count: string;
    /** The deck cards behind the count, by name */
    cards: Array<string>;
    /** What the trigger announces to assistive tech, and the popover's own heading */
    label: string;
};

/**
 * A balance count that opens onto the cards it is counting.
 *
 * A bare "9" asks to be trusted; the count is only ever as convincing as the
 * cards behind it, so it doubles as the button that shows them. Falls back to
 * plain text when there is nothing to list — a zero has no cards to open onto.
 *
 * @returns the count, interactive when it has cards behind it
 */
function BalanceCardCount({ count, cards, label }: BalanceCardCountProps) {
    if (cards.length === 0) return <>{count}</>;

    return (
        <Dropdown>
            <DropdownButton
                as={"button"}
                type={"button"}
                aria-label={`${label} (${count})`}
                className={
                    "underline decoration-zinc-400 decoration-dotted underline-offset-2 hover:decoration-zinc-600 dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
                }
            >
                {count}
            </DropdownButton>
            <DropdownMenu anchor={"bottom end"} className={"max-h-72 max-w-72"}>
                <DropdownHeader>
                    <p className={"text-xs/5 font-medium text-zinc-950 dark:text-white"}>{label}</p>
                    <ul className={"mt-1.5 space-y-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {cards.map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                    </ul>
                </DropdownHeader>
            </DropdownMenu>
        </Dropdown>
    );
}
