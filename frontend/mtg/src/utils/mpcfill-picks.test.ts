import { afterEach, describe, expect, it, vi } from "vitest";
import type { MpcFillImageResponse } from "src/api/generated";
import { loadMpcArtScope, mpcChoose, mpcGroupsWith, mpcPick, saveMpcArtScope } from "src/utils/mpcfill-picks";
import type { ProxyGroup } from "src/utils/proxy-list";
import type { ProxyCard } from "src/utils/proxy-print";

/**
 * One copy of a card on an order
 *
 * @param name the card's name, both halves joined for a two-faced one
 * @param back the back's picture, `null` for a one-sided card
 *
 * @returns the card
 */
function card(name: string, back: string | null = null): ProxyCard {
    return { key: name, name, set: "LEB", number: "1", front: null, back, copies: 1, basic: false };
}

/**
 * An image MPCFill found
 *
 * @param id its drive id
 *
 * @returns the image
 */
function image(id: string): MpcFillImageResponse {
    return {
        id,
        name: `${id}.png`,
        dpi: 800,
        language: "EN",
        size: 1,
        source: "drive",
        tags: [],
        thumbnail_medium: "",
        thumbnail_small: "",
    };
}

describe("art picks", () => {
    const first = image("1");
    const second = image("2");
    const third = image("3");
    const found = [first, second, third];
    const atraxa: ProxyGroup = { deck: { uuid: "a", name: "Atraxa" }, cards: [card("Sol Ring")] };
    const hand: ProxyGroup = { deck: null, cards: [card("Sol Ring")] };

    it("takes the top hit until another is picked", () => {
        expect(mpcPick({}, found, hand, "Sol Ring")).toBe(first);
        expect(mpcPick(mpcChoose({}, hand, "Sol Ring", "2", false), found, hand, "Sol Ring")).toBe(second);
        expect(mpcPick(mpcChoose({}, hand, "Sol Ring", "gone", false), found, hand, "Sol Ring")).toBe(first);
        expect(mpcPick({}, [], hand, "Sol Ring")).toBeNull();
    });

    it("keeps a pick to its own deck", () => {
        const picks = mpcChoose({}, atraxa, "Sol Ring", "2", false);

        expect(mpcPick(picks, found, atraxa, "Sol Ring")).toBe(second);
        expect(mpcPick(picks, found, hand, "Sol Ring")).toBe(first);
    });

    it("hands a pick to every deck, picked apart before or not", () => {
        const apart = mpcChoose({}, atraxa, "Sol Ring", "2", false);
        const picks = mpcChoose(apart, hand, "Sol Ring", "3", true);

        expect(mpcPick(picks, found, atraxa, "Sol Ring")).toBe(third);
        expect(mpcPick(picks, found, hand, "Sol Ring")).toBe(third);
    });

    it("lets a deck pick apart from the rest again", () => {
        const picks = mpcChoose(mpcChoose({}, hand, "Sol Ring", "3", true), atraxa, "Sol Ring", "2", false);

        expect(mpcPick(picks, found, atraxa, "Sol Ring")).toBe(second);
        expect(mpcPick(picks, found, hand, "Sol Ring")).toBe(third);
    });

    it("keeps faces apart", () => {
        const picks = mpcChoose({}, hand, "Sol Ring", "3", true);

        expect(mpcPick(picks, found, hand, "Arcane Signet")).toBe(first);
    });

    it("ranks a favorite under the order's own picks", () => {
        expect(mpcPick({}, found, hand, "Sol Ring", second)).toBe(second);
        expect(mpcPick(mpcChoose({}, hand, "Sol Ring", "1", false), found, hand, "Sol Ring", second)).toBe(first);
    });

    it("counts the groups holding a face, either side of a card", () => {
        const delver = card("Delver of Secrets // Insectile Aberration", "back.jpg");
        const groups = [atraxa, hand, { deck: { uuid: "b", name: "Breya" }, cards: [delver] }];

        expect(mpcGroupsWith(groups, "Sol Ring")).toBe(2);
        expect(mpcGroupsWith(groups, "Insectile Aberration")).toBe(1);
        expect(mpcGroupsWith(groups, "Arcane Signet")).toBe(0);
    });
});

describe("art scope memory", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("asks about every deck until told otherwise", () => {
        const values = new Map<string, string>();
        vi.stubGlobal("localStorage", {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        });

        expect(loadMpcArtScope()).toBe("ask");
        saveMpcArtScope("all");
        expect(loadMpcArtScope()).toBe("all");
    });
});
