import { Dialog, DialogBody, DialogTitle } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { CountedCard } from "src/api/graph-generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardArt } from "src/utils/deck-art";

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
    /** What the trigger announces to assistive tech, and the dialog's heading */
    label: string;
    /** The deck's own artwork, by card name */
    art: Map<string, CardArt>;
};

/**
 * A composition count that opens onto the cards it is counting.
 *
 * The panel's hardest question is why two numbers that sound like the same
 * thing disagree — 42 mana sources against 30 lands is twelve rocks and dorks,
 * or it is a bug, and the totals alone cannot say which. So each total is the
 * button that shows its own working.
 *
 * Artwork rather than a list of names, because recognising a card is faster
 * than reading it and the reader is scanning for the ones that surprise them —
 * the mana creature they had forgotten counts twice. The deck's own printings,
 * so the picture is the one in their list and nothing waits on the network.
 *
 * A card's share is printed beside it whenever it is not a plain 1, because
 * neither count is a headcount: a bucket takes a card at its strongest role's
 * weight, and a type counts every copy. Without the share a reader could count
 * the tiles, get a different number than the one they opened, and be right to
 * distrust both.
 *
 * Falls back to plain text with nothing behind it — a zero has no cards to
 * open onto.
 *
 * @returns the count, interactive when it has cards behind it
 */
export function DeckAdvisorCountCards({ count, cards, label, art }: DeckAdvisorCountCardsProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState(false);

    if (cards.length === 0) return <>{count}</>;

    return (
        <>
            <button
                type={"button"}
                onClick={() => setOpen(true)}
                aria-label={`${label} (${count})`}
                className={
                    "cursor-pointer underline decoration-zinc-400 decoration-dotted underline-offset-2 hover:decoration-zinc-600 dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
                }
            >
                {count}
            </button>

            <Dialog open={open} onClose={() => setOpen(false)} size={"3xl"}>
                <DialogTitle>{label}</DialogTitle>
                <DialogBody>
                    {/* The total again, above its own working: the reader came
                        here from that number and the tiles have to add up to
                        it. */}
                    <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("label.counted-total", { count: cards.length, total: count })}
                    </p>
                    <ul className={"mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"}>
                        {cards.map((card) => (
                            <li key={card.name} className={"flex flex-col gap-1"}>
                                <CardThumbnail
                                    name={card.name}
                                    image={art.get(card.name)?.image ?? null}
                                    thumbnail={art.get(card.name)?.thumbnail ?? null}
                                    sizes={"(min-width: 1024px) 150px, 30vw"}
                                    finish={CardFinish.Nonfoil}
                                    className={"w-full"}
                                    compact
                                />
                                <div className={"flex items-baseline justify-between gap-1.5"}>
                                    <span
                                        className={"min-w-0 truncate text-xs/5 text-zinc-950 dark:text-white"}
                                        title={card.name}
                                    >
                                        {card.name}
                                    </span>
                                    {card.amount !== 1 && (
                                        <span
                                            className={
                                                "shrink-0 text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"
                                            }
                                        >
                                            {share(card.amount)}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </DialogBody>
            </Dialog>
        </>
    );
}
