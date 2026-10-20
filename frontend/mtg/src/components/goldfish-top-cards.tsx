import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { Reorder } from "motion/react";
import { Text } from "components";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuAt } from "src/components/context-menu";
import { GoldfishZoneCard } from "src/components/goldfish-zone-card";
import type { GoldfishCard } from "src/utils/goldfish";

/**
 * The properties for {@link GoldfishTopCards}
 */
export type GoldfishTopCardsProps = {
    /** The cards being looked at, top of the library first */
    cards: Array<GoldfishCard>;
    /** Which card's menu is open, to mark it */
    menued: string | null;
    /** Shows a card as large as the screen allows */
    onZoom: (card: GoldfishCard) => void;
    /** Puts the cards on top of the library in a new order, top first */
    onReorder: (ids: Array<string>) => void;
    /** Opens a card's menu at a point */
    onOpenMenu: (card: GoldfishCard, at: MenuAt) => void;
    /** Told when the pointer comes to rest on a card, and when it leaves */
    onHover: (card: GoldfishCard | null) => void;
};

/**
 * Whether two lists of ids name the same cards in the same order
 *
 * @param first one list
 * @param second the other
 *
 * @returns whether they match
 */
function sameOrder(first: Array<string>, second: Array<string>): boolean {
    return first.length === second.length && first.every((id, index) => second[index] === id);
}

/**
 * The top cards of the library face up in a row, to be dragged into a new order.
 *
 * The row only rearranges itself while a card is dragged; the library takes
 * the new order once it is let go, so one drag is one move to take back.
 *
 * @returns the row
 */
export function GoldfishTopCards({ cards, menued, onZoom, onReorder, onOpenMenu, onHover }: GoldfishTopCardsProps) {
    const [t] = useTranslation("goldfish");
    const ids = cards.map((card) => card.id);
    const [order, setOrder] = useState(ids);
    const [shown, setShown] = useState(ids);
    if (!sameOrder(shown, ids)) {
        setShown(ids);
        setOrder(ids);
    }
    const latest = useRef(order);
    latest.current = order;
    const dragged = useRef(false);

    /**
     * Hands the library the order the row shows, if it changed
     *
     * @param next the order, top first
     */
    function commit(next: Array<string>) {
        if (!sameOrder(next, ids)) onReorder(next);
    }

    /**
     * Moves one card a step towards the top or away from it
     *
     * @param id the card
     * @param step -1 towards the top, 1 away from it
     */
    function shift(id: string, step: -1 | 1) {
        const from = order.indexOf(id);
        const to = from + step;
        if (from === -1 || to < 0 || to >= order.length) return;
        const next = [...order];
        [next[from], next[to]] = [next[to] as string, next[from] as string];
        commit(next);
    }

    /**
     * One of the step buttons beneath a card
     *
     * @param icon the mark
     * @param label what it does
     * @param disabled whether the card cannot go further that way
     * @param onClick what it does
     *
     * @returns the button
     */
    function stepButton(icon: ReactNode, label: string, disabled: boolean, onClick: () => void) {
        return (
            <button
                type={"button"}
                disabled={disabled}
                onClick={onClick}
                aria-label={label}
                title={label}
                className={
                    "rounded-full p-0.5 text-white/70 ring-1 ring-white/15 transition hover:bg-lime-400/15 hover:text-lime-300 disabled:opacity-30 disabled:hover:bg-transparent"
                }
            >
                {icon}
            </button>
        );
    }

    const byId = new Map(cards.map((card) => [card.id, card]));

    return (
        <div className={"flex flex-col gap-3 p-3"}>
            <Text className={"text-xs text-white/60"}>{t("description.look-top")}</Text>
            {cards.length === 0 ? (
                <div className={"py-6 text-center text-sm text-white/50"}>{t("description.empty-zone")}</div>
            ) : (
                <Reorder.Group
                    axis={"x"}
                    values={order}
                    onReorder={setOrder}
                    layoutScroll={true}
                    className={"flex gap-3 overflow-x-auto pb-2"}
                >
                    {order.map((id, index) => {
                        const card = byId.get(id);
                        if (card === undefined) return null;
                        return (
                            <Reorder.Item
                                key={id}
                                value={id}
                                onDragStart={() => {
                                    dragged.current = true;
                                }}
                                onDragEnd={() => commit(latest.current)}
                                className={"w-24 shrink-0 cursor-grab active:cursor-grabbing sm:w-28"}
                            >
                                <GoldfishZoneCard
                                    card={card}
                                    position={index + 1}
                                    menued={menued === card.id}
                                    onPress={() => {
                                        dragged.current = false;
                                    }}
                                    onClick={() => {
                                        if (!dragged.current) onZoom(card);
                                    }}
                                    onOpenMenu={(at) => onOpenMenu(card, at)}
                                    onHover={(hovering) => onHover(hovering ? card : null)}
                                />
                                <div className={"flex justify-center gap-1"}>
                                    {stepButton(
                                        <ChevronLeftIcon className={"size-4"} />,
                                        t("button.towards-top", { name: card.name }),
                                        index === 0,
                                        () => shift(id, -1),
                                    )}
                                    {stepButton(
                                        <ChevronRightIcon className={"size-4"} />,
                                        t("button.away-from-top", { name: card.name }),
                                        index === order.length - 1,
                                        () => shift(id, 1),
                                    )}
                                </div>
                            </Reorder.Item>
                        );
                    })}
                </Reorder.Group>
            )}
        </div>
    );
}
