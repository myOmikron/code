import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import { deckStats } from "src/utils/deck-stats";

const RAMP: DeckTagResponse = { uuid: "tag-ramp", name: "Ramp", color: "lime", icon: "ramp", deck: null };
const WINCON: DeckTagResponse = {
    uuid: "tag-wincon",
    name: "Wincon",
    color: "fuchsia",
    icon: "trophy",
    deck: "deck",
};

/**
 * A slot, with only what the counting reads
 *
 * @param uuid the slot's id
 * @param card the catalog data behind it
 * @param card.type its type line
 * @param card.cost its mana cost, as Scryfall spells it
 * @param card.manaValue what that cost adds up to
 * @param card.identity its colour identity
 * @param tags the tags on it
 * @param zone which zone it sits in, the main deck by default
 *
 * @returns the slot
 */
function slot(
    uuid: string,
    card: { type: string; cost: string; manaValue: number; identity: string },
    tags: Array<string>,
    zone: DeckCardResponse["zone"] = "Main",
): DeckCardResponse {
    return {
        uuid,
        printing: `printing-${uuid}`,
        quantity: 1,
        zone,
        tags,
        foil: false,
        card: {
            name: uuid,
            type_line: card.type,
            mana_cost: card.cost,
            mana_value: card.manaValue,
            color_identity: card.identity,
            produced_mana: [],
            rarity: "Common",
            set_code: "tst",
            price_eur_cents: 100,
            image_small: null,
        },
    } as unknown as DeckCardResponse;
}

const CARDS = [
    slot("sol-ring", { type: "Artifact", cost: "{1}", manaValue: 1, identity: "" }, [RAMP.uuid]),
    slot("cultivate", { type: "Sorcery", cost: "{2}{G}", manaValue: 3, identity: "G" }, [RAMP.uuid]),
    slot("thoracle", { type: "Creature — Merfolk", cost: "{U}{U}", manaValue: 2, identity: "U" }, [
        RAMP.uuid,
        WINCON.uuid,
    ]),
    slot("hydra", { type: "Creature — Hydra", cost: "{G}{U}", manaValue: 2, identity: "GU" }, []),
    slot("island", { type: "Land", cost: "", manaValue: 0, identity: "" }, []),
];

describe("deckStats splits", () => {
    const stats = deckStats(CARDS, ["U", "G"], [RAMP, WINCON]);

    it("keeps the undivided curve as the sum of every split", () => {
        for (const bucket of stats.manaCurveSplit.bars.colors) {
            const split = bucket.segments.reduce((sum, segment) => sum + segment.cards, 0);
            expect(split).toBe(stats.manaCurve.find((entry) => entry.key === bucket.key)?.cards ?? 0);
        }
    });

    it("files a gold card under multicolor and a land nowhere on the curve", () => {
        const two = stats.manaCurveSplit.bars.colors.find((bucket) => bucket.key === "2");

        expect(two?.segments.find((segment) => segment.key === "multicolor")?.cards).toBe(1);
        expect(stats.manaCurveSplit.segments.colors).not.toContain("land");
        expect(stats.manaCurve.find((bucket) => bucket.key === "0")?.cards ?? 0).toBe(0);
    });

    it("splits the curve by tag, counting a card under each tag it carries", () => {
        const two = stats.manaCurveSplit.bars.tags.find((bucket) => bucket.key === "2");

        expect(stats.manaCurveSplit.segments.tags).toStrictEqual([RAMP.uuid, WINCON.uuid, "untagged"]);
        expect(two?.segments.find((segment) => segment.key === RAMP.uuid)?.cards).toBe(1);
        expect(two?.segments.find((segment) => segment.key === WINCON.uuid)?.cards).toBe(1);
        expect(two?.segments.find((segment) => segment.key === "untagged")?.cards).toBe(1);
    });

    it("splits the pips by the same cuts", () => {
        const blue = stats.pipsSplit.bars.tags.find((bucket) => bucket.key === "U");

        expect(stats.pips.find((bucket) => bucket.key === "U")?.cards).toBe(3);
        expect(blue?.segments.find((segment) => segment.key === RAMP.uuid)?.cards).toBe(2);
        expect(blue?.segments.find((segment) => segment.key === "untagged")?.cards).toBe(1);
    });

    it("offers the undivided view as a single layer", () => {
        expect(stats.manaCurveSplit.segments.all).toStrictEqual(["all"]);
    });
});

describe("deckStats by tag", () => {
    const stats = deckStats(CARDS, ["U", "G"], [RAMP, WINCON]);

    it("lists the tags in the deck's order, untagged last", () => {
        expect(stats.tagStats.map((tag) => tag.key)).toStrictEqual([RAMP.uuid, WINCON.uuid, "untagged"]);
    });

    it("counts what a tag holds", () => {
        const ramp = stats.tagStats.find((tag) => tag.key === RAMP.uuid);

        expect(ramp?.cards).toBe(3);
        expect(ramp?.lands).toBe(0);
        expect(ramp?.averageManaValue).toBeCloseTo(2);
        expect(ramp?.value).toBeCloseTo(3);
        expect(ramp?.pips.find((pip) => pip.key === "U")?.cards).toBe(2);
    });

    it("keeps the lands of the untagged cards apart from their curve", () => {
        const untagged = stats.tagStats.find((tag) => tag.key === "untagged");

        expect(untagged?.cards).toBe(2);
        expect(untagged?.lands).toBe(1);
        expect(untagged?.averageManaValue).toBeCloseTo(2);
    });

    it("knows nothing but the untagged cards while the deck was handed no tags", () => {
        const untagged = deckStats(CARDS, ["U", "G"]);

        expect(untagged.tagStats.map((tag) => tag.key)).toStrictEqual(["untagged"]);
        expect(untagged.manaCurveSplit.segments.tags).toStrictEqual(["untagged"]);
    });
});
