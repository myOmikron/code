import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DeviationCopiesResponse } from "src/api/generated";
import { copiesLabel } from "src/components/deck-line-deviation";

/**
 * The properties for {@link DeckNotOnList}
 */
export type DeckNotOnListProps = {
    /** The copies in the Physical deck whose card no counted line names */
    copies: Array<DeviationCopiesResponse>;
};

/**
 * The cards in the Physical deck that the list does not name
 *
 * They have no line of their own to be annotated on, so they get a block below
 * the list. A card that only sits in the maybe board is one of them: the maybe
 * board is ideas, not the deck.
 *
 * @returns the block, or nothing when every card in the deck is on the list
 */
export function DeckNotOnList({ copies }: DeckNotOnListProps) {
    const [t] = useTranslation("deck");
    if (copies.length === 0) return null;

    return (
        <section
            className={
                "flex flex-col gap-3 rounded-(--radius-card) bg-amber-500/5 p-4 ring-1 ring-amber-600/20 dark:ring-amber-400/25"
            }
        >
            <div className={"flex items-start gap-2"}>
                <ExclamationTriangleIcon className={"mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"} />
                <div className={"flex flex-col gap-1"}>
                    <Strong>{t("heading.not-on-list")}</Strong>
                    <Text className={"text-sm"}>{t("description.not-on-list")}</Text>
                </div>
            </div>
            <ul className={"flex flex-col gap-0.5"}>
                {copies.map((entry) => (
                    <li
                        key={`${entry.printing}-${entry.foil}-${entry.proxy}`}
                        className={"text-sm text-zinc-700 dark:text-zinc-300"}
                    >
                        {`${entry.quantity}× ${entry.card?.name ?? t("label.unknown-printing")} (${copiesLabel(entry, t)})`}
                    </li>
                ))}
            </ul>
        </section>
    );
}
