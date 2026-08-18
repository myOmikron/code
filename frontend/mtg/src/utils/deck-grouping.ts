/**
 * How a decklist is broken into groups, and in which order the cards sit.
 *
 * A deck is read differently depending on what is being decided. Cutting cards
 * wants types, fixing the curve wants mana values, checking a commander wants
 * colours, and building to a plan wants the tags the owner put on. The list is
 * the same either way; only the headings move.
 */

import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import { TYPE_GROUP_ORDER, primaryType } from "src/utils/card-types";
import { letters } from "src/utils/deck-rules";

/** What the list is broken up by */
export type DeckGrouping = "type" | "mana" | "color" | "zone" | "tag";

/** What the cards inside a group are ordered by */
export type DeckSort = "name" | "mana" | "price";

/** The groupings on offer, in the order they are listed */
export const DECK_GROUPINGS: Array<DeckGrouping> = ["type", "mana", "color", "zone", "tag"];

/** The orders on offer, in the order they are listed */
export const DECK_SORTS: Array<DeckSort> = ["name", "mana", "price"];

/** Everything above this mana value shares the last bucket */
const MANA_CAP = 7;

/** One heading and what sits under it */
export type DeckGroup = {
    /** What the group is, as a slug the caller turns into a heading */
    key: string;
    /** The slots in it, already ordered */
    cards: Array<DeckCardResponse>;
    /** How many copies those slots hold together */
    copies: number;
};

/**
 * Break a decklist into groups
 *
 * @param cards the slots
 * @param grouping what to break them up by
 * @param sort what to order the cards inside a group by
 * @param tags the tags that exist, needed to order tag groups by name
 *
 * @returns the groups, in the order they should be drawn
 */
export function groupDeck(
    cards: Array<DeckCardResponse>,
    grouping: DeckGrouping,
    sort: DeckSort,
    tags: Array<DeckTagResponse>,
): Array<DeckGroup> {
    const groups = new Map<string, Array<DeckCardResponse>>();

    /**
     * File a slot under a heading
     *
     * @param key the heading
     * @param card the slot
     */
    const file = (key: string, card: DeckCardResponse) => {
        const group = groups.get(key);
        if (group === undefined) groups.set(key, [card]);
        else group.push(card);
    };

    for (const card of cards) {
        switch (grouping) {
            case "zone":
                file(card.zone, card);
                break;
            case "mana":
                file(String(Math.min(Math.round(card.card?.mana_value ?? 0), MANA_CAP)), card);
                break;
            case "color":
                file(colorKey(card), card);
                break;
            case "tag":
                // A card with several tags is listed under each of them: the
                // groups are ways of looking at the deck, not compartments.
                // Everything outside the deck proper keeps its own section, as
                // under the types — a commander is not a plan, and a card on
                // the maybe board should not be counted among the ramp.
                if (card.zone !== "Main") file(`zone:${card.zone}`, card);
                else if (card.tags.length === 0) file("untagged", card);
                else for (const tag of card.tags) file(tag, card);
                break;
            case "type":
                // Only the deck proper is broken up by type. The commander
                // stands above it, and the sideboard and the maybe board keep
                // sections of their own below — otherwise a card that is both
                // in the deck and on the maybe board appears twice among the
                // creatures with nothing saying why.
                file(card.zone === "Main" ? primaryType(card.card?.type_line ?? "") : `zone:${card.zone}`, card);
        }
    }

    const order = groupOrder(grouping, tags);
    return Array.from(groups, ([key, inGroup]) => ({
        key,
        cards: [...inGroup].sort(compare(sort)),
        copies: inGroup.reduce((sum, card) => sum + card.quantity, 0),
    })).sort((left, right) => rank(order, left.key) - rank(order, right.key) || left.key.localeCompare(right.key));
}

/**
 * Which colour bucket a card falls into
 *
 * @param card the slot
 *
 * @returns the bucket
 */
function colorKey(card: DeckCardResponse): string {
    const colors = letters(card.card?.color_identity ?? "");
    if (colors.length === 0) return "colorless";
    if (colors.length > 1) return "multicolor";
    return colors[0] ?? "colorless";
}

/**
 * The order the headings appear in
 *
 * @param grouping what the list is broken up by
 * @param tags the tags that exist
 *
 * @returns the keys in order, anything missing sorts to the end
 */
function groupOrder(grouping: DeckGrouping, tags: Array<DeckTagResponse>): Array<string> {
    switch (grouping) {
        case "zone":
            return ["Commander", "Main", "Side", "Companion", "Maybe"];
        case "mana":
            return Array.from({ length: MANA_CAP + 1 }, (_, value) => String(value));
        case "color":
            return ["W", "U", "B", "R", "G", "multicolor", "colorless"];
        case "tag":
            return [
                "zone:Commander",
                ...tags.map((tag) => tag.uuid),
                "untagged",
                "zone:Side",
                "zone:Companion",
                "zone:Maybe",
            ];
        case "type":
            return ["zone:Commander", ...TYPE_GROUP_ORDER, "zone:Side", "zone:Companion", "zone:Maybe"];
    }
}

/**
 * Where a key sits in an order
 *
 * @param order the order
 * @param key the key
 *
 * @returns its position, anything unknown at the end
 */
function rank(order: Array<string>, key: string): number {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
}

/**
 * How two slots compare under an order
 *
 * @param sort what to order by
 *
 * @returns the comparator
 */
function compare(sort: DeckSort): (left: DeckCardResponse, right: DeckCardResponse) => number {
    switch (sort) {
        case "mana":
            return (left, right) => (left.card?.mana_value ?? 0) - (right.card?.mana_value ?? 0) || byName(left, right);
        case "price":
            return (left, right) =>
                (right.card?.price_eur_cents ?? 0) - (left.card?.price_eur_cents ?? 0) || byName(left, right);
        case "name":
            return byName;
    }
}

/**
 * Two slots by the name of their card
 *
 * @param left one slot
 * @param right the other
 *
 * @returns the comparison
 */
function byName(left: DeckCardResponse, right: DeckCardResponse): number {
    return (left.card?.name ?? "").localeCompare(right.card?.name ?? "");
}
