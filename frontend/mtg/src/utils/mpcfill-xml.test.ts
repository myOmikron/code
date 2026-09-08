import { describe, expect, it } from "vitest";
import { DEFAULT_MPC_STOCK, mpcFillReady, mpcFillXml, mpcFoilable } from "src/utils/mpcfill-xml";
import type { MpcFillOrder, MpcFillOrderCard } from "src/utils/mpcfill-xml";

/**
 * One card of an order
 *
 * @param name the card's name
 * @param copies how many are wanted
 * @param front the id of the art picked for the front, `null` for none
 * @param back the id of the art picked for the back, `null` for a one-sided card
 *
 * @returns the card
 */
function card(
    name: string,
    copies: number,
    front: string | null = "front-id",
    back: string | null = null,
): MpcFillOrderCard {
    return {
        copies,
        frontQuery: name.toLowerCase(),
        front: front === null ? null : { id: front, name: `${name}.png` },
        backQuery: back === null ? null : "back face",
        back: back === null ? null : { id: back, name: "Back Face.png" },
    };
}

/**
 * An order
 *
 * @param cards its cards
 *
 * @returns the order
 */
function order(cards: Array<MpcFillOrderCard>): MpcFillOrder {
    return { cards, stock: DEFAULT_MPC_STOCK, foil: false, cardback: { id: "cardback-id", name: "Back.png" } };
}

describe("mpcFillXml", () => {
    it("writes one slot per copy", () => {
        const xml = mpcFillXml(order([card("Sol Ring", 3)]));

        expect(xml).toContain("<quantity>3</quantity>");
        expect(xml).toContain("<slots>0,1,2</slots>");
    });

    it("numbers the slots across the cards", () => {
        const xml = mpcFillXml(order([card("Sol Ring", 2, "sol"), card("Arcane Signet", 1, "signet")]));

        expect(xml).toContain("<id>sol</id>\n            <slots>0,1</slots>");
        expect(xml).toContain("<id>signet</id>\n            <slots>2</slots>");
    });

    it("files a back against the slot it belongs to", () => {
        const xml = mpcFillXml(
            order([card("Delver of Secrets", 1, "delver", "aberration"), card("Sol Ring", 1, "sol")]),
        );

        expect(xml).toContain("<backs>");
        expect(xml).toContain("<id>aberration</id>\n            <slots>0</slots>");
        expect(xml).toContain("<query>back face</query>");
    });

    it("leaves out the backs element when no card brings one", () => {
        expect(mpcFillXml(order([card("Sol Ring", 1)]))).not.toContain("<backs>");
    });

    it("charges the order to the bracket it fits in", () => {
        expect(mpcFillXml(order([card("Sol Ring", 20)]))).toContain("<bracket>36</bracket>");
    });

    it("writes no bracket for an order that has to be split", () => {
        const xml = mpcFillXml(order([card("Sol Ring", 400), card("Arcane Signet", 400, "signet")]));

        expect(xml).toContain("<quantity>800</quantity>");
        expect(xml).not.toContain("<bracket>");
    });

    it("takes the common back along", () => {
        expect(mpcFillXml(order([card("Sol Ring", 1)]))).toContain("<cardback>cardback-id</cardback>");
    });

    it("skips a card nobody picked art for", () => {
        const xml = mpcFillXml(order([card("Sol Ring", 1, null), card("Arcane Signet", 1, "signet")]));

        expect(xml).toContain("<quantity>1</quantity>");
        expect(xml).toContain("<id>signet</id>\n            <slots>0</slots>");
    });

    it("keeps the file xml when a name carries an ampersand", () => {
        const fire = card("Fire", 1, "fire");
        fire.front = { id: "fire", name: "Fire & Ice.png" };

        expect(mpcFillXml(order([fire]))).toContain("<name>Fire &amp; Ice.png</name>");
    });

    it("does not print foil on the stock that has none", () => {
        const plastic: MpcFillOrder = { ...order([card("Sol Ring", 1)]), stock: "(P10) Plastic", foil: true };

        expect(mpcFillXml(plastic)).toContain("<foil>false</foil>");
    });

    it("prints foil where it was asked for", () => {
        expect(mpcFillXml({ ...order([card("Sol Ring", 1)]), foil: true })).toContain("<foil>true</foil>");
    });
});

describe("mpcFillReady", () => {
    it("counts only what can be ordered", () => {
        const cards = [card("Sol Ring", 1), card("Arcane Signet", 1, null), card("Ponder", 0, "ponder")];

        expect(mpcFillReady(cards)).toHaveLength(1);
    });
});

describe("mpcFoilable", () => {
    it("knows the one stock that cannot be foiled", () => {
        expect(mpcFoilable("(P10) Plastic")).toBe(false);
        expect(mpcFoilable(DEFAULT_MPC_STOCK)).toBe(true);
    });
});
