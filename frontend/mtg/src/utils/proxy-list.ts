/**
 * A proxy list, kept deck by deck.
 *
 * Decks stay in the order they were added; the cards picked by hand come last.
 * Every change returns a new list, and a group left without cards is dropped.
 */

import { MAX_COPIES } from "src/utils/proxy-print";
import type { ProxyCard } from "src/utils/proxy-print";

/** A deck on a proxy list */
export type ProxyDeck = {
    /** The deck's uuid */
    uuid: string;
    /** The deck's name */
    name: string;
};

/** The cards of one deck on a proxy list */
export type ProxyGroup = {
    /** The deck, `null` for the cards picked by hand */
    deck: ProxyDeck | null;
    /** Its cards, in the order the deck lists them */
    cards: Array<ProxyCard>;
};

/**
 * Puts a deck's cards on the list, or tops up a deck already on it
 *
 * Topping up keeps the copies already set and adds the slots that are missing,
 * in the deck's order.
 *
 * @param groups the list
 * @param deck the deck
 * @param cards the cards read from it
 *
 * @returns the new list
 */
export function addDeck(groups: Array<ProxyGroup>, deck: ProxyDeck, cards: Array<ProxyCard>): Array<ProxyGroup> {
    const known = groups.find((group) => group.deck?.uuid === deck.uuid);

    if (known === undefined) {
        if (cards.length === 0) return groups;
        const hand = groups.findIndex((group) => group.deck === null);
        const group = { deck, cards };
        return hand === -1 ? [...groups, group] : [...groups.slice(0, hand), group, ...groups.slice(hand)];
    }

    const kept = new Map(known.cards.map((card) => [card.key, card]));
    const read = new Set(cards.map((card) => card.key));
    const merged = [
        ...cards.map((card) => kept.get(card.key) ?? card),
        ...known.cards.filter((card) => !read.has(card.key)),
    ];

    return groups.map((group) => (group === known ? { ...group, cards: merged } : group));
}

/**
 * Puts one more copy of a card picked by hand on the list
 *
 * @param groups the list
 * @param card the card, with one copy
 *
 * @returns the new list
 */
export function addCard(groups: Array<ProxyGroup>, card: ProxyCard): Array<ProxyGroup> {
    const hand = groups.find((group) => group.deck === null);
    if (hand === undefined) return [...groups, { deck: null, cards: [card] }];
    if (hand.cards.some((known) => known.key === card.key)) return changeCopies(groups, card.key, 1);

    return groups.map((group) => (group === hand ? { ...group, cards: [...group.cards, card] } : group));
}

/**
 * Changes how many copies of one card are on the list
 *
 * @param groups the list
 * @param key the card
 * @param step how many copies more, or fewer when negative
 *
 * @returns the new list, without the card once it is down to none
 */
export function changeCopies(groups: Array<ProxyGroup>, key: string, step: number): Array<ProxyGroup> {
    return compact(
        groups.map((group) => ({
            ...group,
            cards: group.cards
                .map((card) =>
                    card.key === key ? { ...card, copies: Math.min(MAX_COPIES, card.copies + step) } : card,
                )
                .filter((card) => card.copies > 0),
        })),
    );
}

/**
 * Takes a card off the list altogether
 *
 * @param groups the list
 * @param key the card
 *
 * @returns the new list
 */
export function dropCard(groups: Array<ProxyGroup>, key: string): Array<ProxyGroup> {
    return compact(groups.map((group) => ({ ...group, cards: group.cards.filter((card) => card.key !== key) })));
}

/**
 * Takes a deck and its cards off the list
 *
 * @param groups the list
 * @param uuid the deck
 *
 * @returns the new list
 */
export function dropDeck(groups: Array<ProxyGroup>, uuid: string): Array<ProxyGroup> {
    return groups.filter((group) => group.deck?.uuid !== uuid);
}

/**
 * How many copies of a card are on the list
 *
 * @param groups the list
 * @param key the card
 *
 * @returns the copies, 0 when it is not on the list
 */
export function copiesOf(groups: Array<ProxyGroup>, key: string): number {
    for (const group of groups) {
        const card = group.cards.find((known) => known.key === key);
        if (card !== undefined) return card.copies;
    }
    return 0;
}

/**
 * The list as it stands with only its proxies
 *
 * A deck without any stays on it, empty, so it can still be seen and taken off.
 *
 * @param groups the list
 *
 * @returns the list with every other card filtered out
 */
export function onlyProxyCards(groups: Array<ProxyGroup>): Array<ProxyGroup> {
    return groups.map((group) => ({ ...group, cards: group.cards.filter((card) => card.proxy) }));
}

/**
 * Whether the groups are shown under headings
 *
 * @param groups the list
 *
 * @returns `false` only for a list of cards picked by hand alone
 */
export function showsHeadings(groups: Array<ProxyGroup>): boolean {
    return groups.length > 1 || (groups[0] !== undefined && groups[0].deck !== null);
}

/**
 * Drops the groups left without cards
 *
 * @param groups the list
 *
 * @returns the list without them
 */
function compact(groups: Array<ProxyGroup>): Array<ProxyGroup> {
    return groups.filter((group) => group.cards.length > 0);
}
