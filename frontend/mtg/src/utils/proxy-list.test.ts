import { describe, expect, it } from "vitest";
import {
    addCard,
    addDeck,
    changeCopies,
    copiesOf,
    dropCard,
    dropDeck,
    groupSheets,
    onlyProxyCards,
    showsHeadings,
} from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
import type { ProxyCard } from "src/utils/proxy-print";

const ATRAXA = { uuid: "a", name: "Atraxa" };
const KRENKO = { uuid: "k", name: "Krenko" };

/**
 * A card on the list
 *
 * @param key what tells it apart
 * @param copies how many are wanted
 * @param proxy whether it counts as a proxy
 *
 * @returns the card
 */
function card(key: string, copies = 1, proxy = false): ProxyCard {
    return { key, name: key, set: "LEB", number: "161", front: "front.jpg", back: null, copies, basic: false, proxy };
}

/**
 * The list as deck names and card keys
 *
 * @param groups the list
 *
 * @returns one line per group
 */
function shape(groups: Array<ProxyGroup>): Array<string> {
    return groups.map((group) => `${group.deck?.name ?? "hand"}: ${group.cards.map((one) => one.key).join(",")}`);
}

describe("addDeck", () => {
    it("keeps decks in the order they came, before the hand picks", () => {
        let groups = addCard([], card("bolt"));
        groups = addDeck(groups, ATRAXA, [card("sol-ring")]);
        groups = addDeck(groups, KRENKO, [card("goblin")]);

        expect(shape(groups)).toStrictEqual(["Atraxa: sol-ring", "Krenko: goblin", "hand: bolt"]);
    });

    it("adds nothing for a deck that brings no cards", () => {
        expect(addDeck([], ATRAXA, [])).toStrictEqual([]);
    });

    it("tops up a deck in its own order and keeps the copies set", () => {
        let groups = addDeck([], ATRAXA, [card("b")]);
        groups = changeCopies(groups, "b", 2);
        groups = addDeck(groups, ATRAXA, [card("a"), card("b"), card("c")]);

        expect(shape(groups)).toStrictEqual(["Atraxa: a,b,c"]);
        expect(copiesOf(groups, "b")).toBe(3);
    });
});

describe("addCard", () => {
    it("counts a card up when it is picked again", () => {
        const groups = addCard(addCard([], card("bolt")), card("bolt"));

        expect(copiesOf(groups, "bolt")).toBe(2);
    });
});

describe("changeCopies", () => {
    it("drops the card with its last copy, and the deck with its last card", () => {
        const groups = changeCopies(addDeck([], ATRAXA, [card("sol-ring")]), "sol-ring", -1);

        expect(groups).toStrictEqual([]);
    });
});

describe("dropCard and dropDeck", () => {
    it("take a card or a whole deck off", () => {
        let groups = addDeck([], ATRAXA, [card("a"), card("b")]);
        groups = addDeck(groups, KRENKO, [card("c")]);

        expect(shape(dropCard(groups, "a"))).toStrictEqual(["Atraxa: b", "Krenko: c"]);
        expect(shape(dropDeck(groups, "a"))).toStrictEqual(["Krenko: c"]);
    });
});

describe("dropDeck", () => {
    it("takes the hand picks off too", () => {
        const groups = addCard(addDeck([], ATRAXA, [card("a")]), card("bolt", 1, true));

        expect(shape(dropDeck(groups, null))).toStrictEqual(["Atraxa: a"]);
    });
});

describe("groupSheets", () => {
    /**
     * The sheets a list lands on
     *
     * @param groups the list
     *
     * @returns one line per group
     */
    function spans(groups: Array<ProxyGroup>): Array<string> {
        return groupSheets(groups, true, true).map(({ group, first, last }) => `${group.deck?.name}: ${first}-${last}`);
    }

    it("shares a sheet where one deck ends and the next begins", () => {
        const groups = addDeck(addDeck([], ATRAXA, [card("a", 10)]), KRENKO, [card("k", 10)]);

        expect(spans(groups)).toStrictEqual(["Atraxa: 0-1", "Krenko: 1-2"]);
    });

    it("starts the next deck on a new sheet after a full one", () => {
        const groups = addDeck(addDeck([], ATRAXA, [card("a", 9)]), KRENKO, [card("k", 1)]);

        expect(spans(groups)).toStrictEqual(["Atraxa: 0-0", "Krenko: 1-1"]);
    });

    it("skips a group that puts nothing on paper", () => {
        const empty = { deck: ATRAXA, cards: [] };

        expect(spans([empty, ...addDeck([], KRENKO, [card("k")])])).toStrictEqual(["Krenko: 0-0"]);
    });
});

describe("onlyProxyCards", () => {
    it("filters a deck down to its proxies and leaves the source list alone", () => {
        const groups = addDeck([], ATRAXA, [card("sol-ring", 1, true), card("ponder")]);

        expect(shape(onlyProxyCards(groups))).toStrictEqual(["Atraxa: sol-ring"]);
        expect(shape(groups)).toStrictEqual(["Atraxa: sol-ring,ponder"]);
    });

    it("keeps a deck without proxies on the list, empty", () => {
        expect(shape(onlyProxyCards(addDeck([], ATRAXA, [card("ponder")])))).toStrictEqual(["Atraxa: "]);
    });

    it("keeps the cards picked by hand", () => {
        const groups = addCard(addDeck([], ATRAXA, [card("ponder")]), card("bolt", 1, true));

        expect(shape(onlyProxyCards(groups))).toStrictEqual(["Atraxa: ", "hand: bolt"]);
    });
});

describe("showsHeadings", () => {
    it("leaves a list of hand picks alone without headings", () => {
        expect(showsHeadings(addCard([], card("bolt")))).toBe(false);
        expect(showsHeadings(addDeck([], ATRAXA, [card("a")]))).toBe(true);
    });
});
