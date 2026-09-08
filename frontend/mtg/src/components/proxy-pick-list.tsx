import { MinusIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { ProxyCard } from "src/utils/proxy-print";

/**
 * The properties for {@link ProxyPickList}
 */
export type ProxyPickListProps = {
    /** What is on the list */
    cards: Array<ProxyCard>;
    /** Puts one more copy of a card on it */
    onMore: (key: string) => void;
    /** Takes one copy back off */
    onFewer: (key: string) => void;
    /** Takes a card off altogether */
    onDrop: (key: string) => void;
    /** Empties the list */
    onClear: () => void;
};

/**
 * The cards a proxy run is made of, one row each.
 *
 * Shared by both proxy tools: what is picked reads the same whether it ends up
 * on a sheet of A4 or in an order, down to the note on a card that brings a
 * second face along — that is a fact about the card, and it is the reason the
 * one costs a second square on the paper and the other does not.
 *
 * @returns the list, or a line saying there is nothing on it
 */
export function ProxyPickList({ cards, onMore, onFewer, onDrop, onClear }: ProxyPickListProps) {
    const [t] = useTranslation("game-utils");

    if (cards.length === 0) return <Text className={"text-sm"}>{t("description.nothing-picked")}</Text>;

    return (
        <>
            <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                {cards.map((card) => (
                    <li key={card.key} className={"flex items-center gap-2 py-2"}>
                        <Strong className={"min-w-0 flex-1 truncate text-sm"}>{card.name}</Strong>
                        {card.back !== null && (
                            <span className={"shrink-0 text-xs text-zinc-500 max-sm:hidden dark:text-zinc-400"}>
                                {t("label.two-sided")}
                            </span>
                        )}
                        <Button
                            plain={true}
                            aria-label={t("accessibility.fewer-copies", { name: card.name })}
                            onClick={() => onFewer(card.key)}
                        >
                            <MinusIcon />
                        </Button>
                        <span className={"w-6 shrink-0 text-center text-sm text-zinc-950 tabular-nums dark:text-white"}>
                            {card.copies}
                        </span>
                        <Button
                            plain={true}
                            aria-label={t("accessibility.more-copies", { name: card.name })}
                            onClick={() => onMore(card.key)}
                        >
                            <PlusIcon />
                        </Button>
                        <Button
                            plain={true}
                            aria-label={t("accessibility.drop-card", { name: card.name })}
                            onClick={() => onDrop(card.key)}
                        >
                            <XMarkIcon />
                        </Button>
                    </li>
                ))}
            </ul>
            <Button outline={true} onClick={onClear}>
                <TrashIcon />
                {t("button.clear-list")}
            </Button>
        </>
    );
}
