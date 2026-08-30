import { Dropdown, DropdownButton, DropdownHeader, DropdownMenu } from "components";
import { CountedCard } from "src/api/graph-generated";

/**
 * Formats one card's share of a count, without a pointless `.0`
 *
 * @param value the contribution, which is rarely a whole number
 *
 * @returns the share as the panel spells its other numbers
 */
function share(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/**
 * The properties for {@link DeckAdvisorCountCards}
 */
export type DeckAdvisorCountCardsProps = {
    /** The count as already formatted for display */
    count: string;
    /** The cards behind it, largest contribution first */
    cards: Array<CountedCard>;
    /** What the trigger announces to assistive tech, and the popover's heading */
    label: string;
};

/**
 * A composition count that opens onto the cards it is counting.
 *
 * The panel's hardest question is why two numbers that sound like the same
 * thing disagree — 42 mana sources against 30 lands is twelve rocks and dorks,
 * or it is a bug, and the totals alone cannot say which. So each total is the
 * button that shows its own working.
 *
 * A card's share is printed beside it whenever it is not a plain 1, because
 * neither count is a headcount: a bucket takes a card at its strongest role's
 * weight, and a type counts every copy. Without the share a reader could count
 * the list, get a different number than the one they opened, and be right to
 * distrust both.
 *
 * Falls back to plain text with nothing behind it — a zero has no cards to
 * open onto.
 *
 * @returns the count, interactive when it has cards behind it
 */
export function DeckAdvisorCountCards({ count, cards, label }: DeckAdvisorCountCardsProps) {
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
                        {cards.map((card) => (
                            <li key={card.name} className={"flex items-baseline justify-between gap-3"}>
                                <span className={"min-w-0 truncate"}>{card.name}</span>
                                {card.amount !== 1 && (
                                    <span className={"shrink-0 tabular-nums"}>{share(card.amount)}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </DropdownHeader>
            </DropdownMenu>
        </Dropdown>
    );
}
