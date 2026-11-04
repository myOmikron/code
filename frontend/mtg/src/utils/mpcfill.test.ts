import { afterEach, describe, expect, it, vi } from "vitest";
import {
    loadMpcSort,
    MPC_BRACKETS,
    mpcBracket,
    mpcCards,
    mpcCount,
    mpcFillList,
    mpcQuery,
    mpcTiles,
    saveMpcSort,
} from "src/utils/mpcfill";
import type { ProxyCard } from "src/utils/proxy-print";

/**
 * A card on an order
 *
 * @param name the card's name, both halves joined for a two-faced one
 * @param copies how many are wanted
 * @param print set code and collector number, left out for a card the catalog misses
 * @param basic whether it is a basic land
 *
 * @returns the card
 */
function card(name: string, copies: number, print: [string, string] | null = ["LEB", "161"], basic = false): ProxyCard {
    return {
        key: `${name}-${copies}`,
        name,
        set: print?.[0] ?? "",
        number: print?.[1] ?? "",
        front: null,
        back: null,
        copies,
        basic,
        proxy: false,
    };
}

describe("mpcTiles", () => {
    const cards = [card("Urza's Saga", 1), card("Arcane Signet", 1), card("Sol Ring", 1), card("", 1, null)];

    /**
     * The names of some tiles
     *
     * @param tiles the tiles
     *
     * @returns their names
     */
    const names = (tiles: Array<ProxyCard>) => tiles.map((tile) => tile.name);

    it("puts the newest hand pick first", () => {
        expect(names(mpcTiles(cards, "added", true, ""))).toStrictEqual(["Sol Ring", "Arcane Signet", "Urza's Saga"]);
    });

    it("keeps a deck in its own order", () => {
        expect(names(mpcTiles(cards, "added", false, ""))).toStrictEqual(["Urza's Saga", "Arcane Signet", "Sol Ring"]);
    });

    it("sorts by name on request", () => {
        expect(names(mpcTiles(cards, "name", true, ""))).toStrictEqual(["Arcane Signet", "Sol Ring", "Urza's Saga"]);
    });

    it("finds a name however its punctuation is typed", () => {
        expect(names(mpcTiles(cards, "name", true, "URZAS"))).toStrictEqual(["Urza's Saga"]);
        expect(names(mpcTiles(cards, "name", true, "urza's sa"))).toStrictEqual(["Urza's Saga"]);
    });

    it("leaves the list it was given alone", () => {
        mpcTiles(cards, "added", true, "");

        expect(cards[0]?.name).toBe("Urza's Saga");
    });
});

describe("mpc sort memory", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("starts on the newest cards and remembers a choice", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        });

        expect(loadMpcSort()).toBe("added");
        saveMpcSort("name");
        expect(loadMpcSort()).toBe("name");
    });

    it("falls back on a value it does not know", () => {
        vi.stubGlobal("localStorage", { getItem: () => "price" });

        expect(loadMpcSort()).toBe("added");
    });

    it("survives blocked storage", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        });

        expect(loadMpcSort()).toBe("added");
        expect(() => saveMpcSort("name")).not.toThrow();
    });
});

describe("mpcCards", () => {
    it("adds up the copies of one print", () => {
        const rows = mpcCards([card("Sol Ring", 1), card("Sol Ring", 2)], false);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.copies).toBe(3);
    });

    it("keeps two prints of the same card apart", () => {
        const rows = mpcCards([card("Sol Ring", 1), card("Sol Ring", 1, ["LTR", "297"])], false);

        expect(rows.map((row) => row.number)).toStrictEqual(["161", "297"]);
    });

    it("leaves the basic lands off when they are not wanted", () => {
        const cards = [card("Island", 4, ["ISD", "254"], true), card("Sol Ring", 1)];

        expect(mpcCards(cards, true).map((row) => row.name)).toStrictEqual(["Sol Ring"]);
        expect(mpcCards(cards, false)).toHaveLength(2);
    });

    it("drops a card the catalog has no name for", () => {
        expect(mpcCards([card("", 2, null)], false)).toStrictEqual([]);
    });

    it("sorts the rows by name", () => {
        const rows = mpcCards([card("Sol Ring", 1), card("Arcane Signet", 1)], false);

        expect(rows.map((row) => row.name)).toStrictEqual(["Arcane Signet", "Sol Ring"]);
    });
});

describe("mpcCount", () => {
    it("counts a two-faced card once", () => {
        expect(mpcCount(mpcCards([card("Delver of Secrets // Insectile Aberration", 4, ["ISD", "51"])], false))).toBe(
            4,
        );
    });
});

describe("mpcBracket", () => {
    it("takes the smallest bracket the order fits in", () => {
        expect(mpcBracket(1)).toBe(18);
        expect(mpcBracket(18)).toBe(18);
        expect(mpcBracket(19)).toBe(36);
    });

    it("has no bracket for an order that has to be split", () => {
        expect(mpcBracket(MPC_BRACKETS[MPC_BRACKETS.length - 1] ?? 0)).toBe(612);
        expect(mpcBracket(613)).toBeNull();
    });
});

describe("mpcFillList", () => {
    it("writes the copies, the name and the print", () => {
        expect(mpcFillList(mpcCards([card("Sol Ring", 2, ["LTR", "297"])], false))).toBe("2x Sol Ring (LTR) 297");
    });

    it("pins the print of both faces of a two-sided card", () => {
        const rows = mpcCards([card("Delver of Secrets // Insectile Aberration", 1, ["ISD", "51"])], false);

        expect(mpcFillList(rows)).toBe("1x Delver of Secrets (ISD) 51 // Insectile Aberration (ISD) 51");
    });

    it("leaves the print off a card the catalog does not know it for", () => {
        expect(mpcFillList(mpcCards([card("Sol Ring", 1, null)], false))).toBe("1x Sol Ring");
    });

    it("writes one line per card", () => {
        const rows = mpcCards([card("Sol Ring", 1), card("Arcane Signet", 1, ["ELD", "331"])], false);

        expect(mpcFillList(rows).split("\n")).toStrictEqual(["1x Arcane Signet (ELD) 331", "1x Sol Ring (LEB) 161"]);
    });
});

describe("mpcQuery", () => {
    it("closes the gap an apostrophe leaves", () => {
        // Their index holds `urzas saga`; a search for `urza s saga` finds
        // nothing at all.
        expect(mpcQuery("Urza's Saga")).toBe("urzas saga");
        expect(mpcQuery("Urza\u2019s Saga")).toBe("urzas saga");
    });

    it("drops the punctuation and keeps the words apart", () => {
        expect(mpcQuery("Braids, Cabal Minion")).toBe("braids cabal minion");
        expect(mpcQuery("Ach! Hans, Run!")).toBe("ach hans run");
    });

    it("keeps the hyphen a name is printed with", () => {
        expect(mpcQuery("Snow-Covered Forest")).toBe("snow-covered forest");
    });
});
