import { MinusIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Strong, Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProxyGroupRow } from "src/components/proxy-group-row";
import { showsHeadings } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";

/**
 * The properties for {@link ProxyPickList}
 */
export type ProxyPickListProps = {
    /** What is on the list, deck by deck */
    groups: Array<ProxyGroup>;
    /** How many cards of a group go out, as the page counts them */
    countOf: (group: ProxyGroup) => number;
    /** Puts one more copy of a card on it */
    onMore: (key: string) => void;
    /** Takes one copy back off */
    onFewer: (key: string) => void;
    /** Takes a card off altogether */
    onDrop: (key: string) => void;
    /** Takes a group and its cards off, `null` for the hand picks */
    onDropDeck: (uuid: string | null) => void;
    /** Empties the list */
    onClear: () => void;
};

/**
 * The cards of a print run, one row each, in decks that fold.
 *
 * @returns the list, or a line saying there is nothing on it
 */
export function ProxyPickList({ groups, countOf, onMore, onFewer, onDrop, onDropDeck, onClear }: ProxyPickListProps) {
    const [t] = useTranslation("game-utils");
    const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});

    if (groups.length === 0) return <Text className={"text-sm"}>{t("description.nothing-picked")}</Text>;

    const headed = showsHeadings(groups);

    return (
        <>
            <div className={"flex flex-col divide-y divide-zinc-950/10 dark:divide-white/10"}>
                {groups.map((group) => {
                    const key = group.deck?.uuid ?? "hand";
                    // A lone deck shows its cards, several start folded.
                    const open = !headed || (unfolded[key] ?? groups.length === 1);
                    return (
                        <section key={key}>
                            {headed && (
                                <ProxyGroupRow
                                    group={group}
                                    count={countOf(group)}
                                    level={4}
                                    open={open}
                                    onToggle={() => setUnfolded((held) => ({ ...held, [key]: !open }))}
                                    onDropDeck={onDropDeck}
                                />
                            )}
                            {open && (
                                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                    {group.cards.map((card) => (
                                        <li key={card.key} className={"flex items-center gap-2 py-2"}>
                                            <Strong className={"min-w-0 flex-1 truncate text-sm"}>{card.name}</Strong>
                                            {card.back !== null && (
                                                <span
                                                    className={
                                                        "shrink-0 text-xs text-zinc-500 max-sm:hidden dark:text-zinc-400"
                                                    }
                                                >
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
                                            <span
                                                className={
                                                    "w-6 shrink-0 text-center text-sm text-zinc-950 tabular-nums dark:text-white"
                                                }
                                            >
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
                            )}
                        </section>
                    );
                })}
            </div>
            <Button outline={true} onClick={onClear}>
                <TrashIcon />
                {t("button.clear-list")}
            </Button>
        </>
    );
}
