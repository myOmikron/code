import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import type { HandOutcome } from "src/utils/deck-odds";
import { afterFreeMulligan, deckOdds } from "src/utils/deck-odds";

const CHANCES = [0.1, 0.2, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02];

const FIRST: HandOutcome = {
    distribution: CHANCES.map((chance, lands) => ({ lands, chance })),
    keepable: 0.6,
    summary: [
        { verdict: "screwed", chance: 0.3 },
        { verdict: "half", chance: 0.3 },
        { verdict: "good", chance: 0.3 },
        { verdict: "flooded", chance: 0.1 },
    ],
};

describe("afterFreeMulligan", () => {
    it("stays a distribution", () => {
        const total = afterFreeMulligan(FIRST).distribution.reduce((sum, entry) => sum + entry.chance, 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it("keeps a hand as often as two tries allow", () => {
        expect(afterFreeMulligan(FIRST).keepable).toBeCloseTo(1 - (1 - FIRST.keepable) ** 2, 10);
    });

    it("leaves the bad hands only as the second draw", () => {
        const mulliganed = afterFreeMulligan(FIRST);
        const screwed = mulliganed.distribution
            .filter((entry) => entry.lands < 2)
            .reduce((sum, entry) => sum + entry.chance, 0);
        expect(screwed).toBeCloseTo(0.3 * (1 - FIRST.keepable), 10);
    });

    it("finds a land more often after the mulligan", () => {
        const before = FIRST.distribution[0]?.chance ?? 0;
        const after = afterFreeMulligan(FIRST).distribution[0]?.chance ?? 0;
        expect(after).toBeLessThan(before);
    });

    it("changes nothing when every hand is keepable", () => {
        const certain: HandOutcome = {
            distribution: [{ lands: 3, chance: 1 }],
            keepable: 1,
            summary: [
                { verdict: "screwed", chance: 0 },
                { verdict: "half", chance: 0 },
                { verdict: "good", chance: 1 },
                { verdict: "flooded", chance: 0 },
            ],
        };
        expect(afterFreeMulligan(certain).distribution).toStrictEqual(certain.distribution);
    });
});

const RAMP: DeckTagResponse = { uuid: "tag-ramp", name: "Ramp", color: "lime", icon: "ramp", deck: null };

/**
 * A slot, with only what the odds read
 *
 * @param uuid the slot's id
 * @param card the catalog data behind it
 * @param card.type its type line
 * @param card.manaValue what its cost adds up to
 * @param card.cost its mana cost, as Scryfall spells it, none by default
 * @param card.produces the mana it makes, none by default
 * @param quantity how many copies
 * @param tags the tags on it
 *
 * @returns the slot
 */
function slot(
    uuid: string,
    card: { type: string; manaValue: number; cost?: string; produces?: Array<string> },
    quantity: number,
    tags: Array<string>,
): DeckCardResponse {
    return {
        uuid,
        printing: `printing-${uuid}`,
        quantity,
        zone: "Main",
        tags,
        foil: false,
        card: {
            name: uuid,
            type_line: card.type,
            mana_cost: card.cost ?? "",
            mana_value: card.manaValue,
            color_identity: "",
            produced_mana: card.produces ?? [],
            rarity: "Common",
            set_code: "tst",
            price_eur_cents: 100,
            image_small: null,
        },
    } as unknown as DeckCardResponse;
}

const DECK = [
    slot("forest", { type: "Land", manaValue: 0 }, 36, []),
    slot("rock", { type: "Artifact", manaValue: 2 }, 12, [RAMP.uuid]),
    slot("bear", { type: "Creature — Bear", manaValue: 2 }, 21, []),
    slot("dragon", { type: "Creature — Dragon", manaValue: 9 }, 30, []),
];

describe("deckOdds and snow", () => {
    const SNOW = [
        slot("snow-forest", { type: "Basic Snow Land — Forest", manaValue: 0, produces: ["G"] }, 4, []),
        slot("forest", { type: "Basic Land — Forest", manaValue: 0, produces: ["G"] }, 32, []),
        slot("brawl", { type: "Snow Sorcery", manaValue: 2, cost: "{G}{S}" }, 4, []),
        slot("bear", { type: "Creature — Bear", manaValue: 2, cost: "{1}{G}" }, 59, []),
    ];

    it("asks a Snow pip for a Snow source, apart from the colours", () => {
        const odds = deckOdds(SNOW, ["G"]);

        expect(odds.thin).toStrictEqual([
            expect.objectContaining({ name: "brawl", color: "S", wanted: 1, sources: 4, turn: 2 }),
        ]);
    });

    it("reads the chance of a Snow source in the opening hand behind the colours", () => {
        const odds = deckOdds(SNOW, ["G"]);

        expect(odds.opening.colors.map((color) => color.key)).toStrictEqual(["G", "S"]);
    });

    it("says nothing about snow in a deck without a Snow pip", () => {
        const odds = deckOdds(
            SNOW.filter((card) => card.uuid !== "brawl"),
            ["G"],
        );

        expect(odds.opening.colors.map((color) => color.key)).toStrictEqual(["G"]);
    });

    it("checks a card that costs nothing but Snow pips", () => {
        const odds = deckOdds(
            [...SNOW.slice(0, 2), slot("coat", { type: "Snow Artifact", manaValue: 2, cost: "{S}{S}" }, 1, [])],
            ["G"],
        );

        expect(odds.checked).toBe(1);
        expect(odds.thin.map((card) => card.color)).toStrictEqual(["S"]);
    });
});

describe("deckOdds composition", () => {
    const odds = deckOdds(DECK, ["G"], [RAMP]);
    const { mana, tags } = odds.opening.composition.first;

    it("draws a bar per mana value up to the highest one in use", () => {
        expect(mana.map((group) => group.key)).toStrictEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
        expect(mana.find((group) => group.key === "2")?.cards).toBe(33);
        expect(mana.find((group) => group.key === "7")?.cards).toBe(30);
    });

    it("expects the spells in the hand to divide as the deck's spells do", () => {
        const spells = mana.reduce((sum, group) => sum + group.expected, 0);
        const meanLands = odds.opening.first.distribution.reduce((sum, entry) => sum + entry.lands * entry.chance, 0);

        expect(spells).toBeCloseTo(7 - meanLands, 10);
        expect(mana.find((group) => group.key === "2")?.expected).toBeCloseTo(((7 - meanLands) * 33) / 63, 10);
    });

    it("counts a tag's lands and spells alike, untagged last", () => {
        expect(tags.map((group) => group.key)).toStrictEqual([RAMP.uuid, "untagged"]);
        expect(tags.reduce((sum, group) => sum + group.cards, 0)).toBe(odds.opening.deckSize);
        expect(tags.reduce((sum, group) => sum + group.expected, 0)).toBeCloseTo(7, 10);
    });

    it("keeps every chance a probability, and zero only for an empty group", () => {
        for (const group of [...mana, ...tags]) {
            expect(group.atLeastOne).toBeGreaterThanOrEqual(0);
            expect(group.atLeastOne).toBeLessThanOrEqual(1);
            if (group.cards === 0) expect(group.atLeastOne).toBe(0);
            else expect(group.atLeastOne).toBeGreaterThan(0);
        }
    });

    it("moves the spells with the lands when the first hand may go back", () => {
        const meanLands = (hand: HandOutcome) =>
            hand.distribution.reduce((sum, entry) => sum + entry.lands * entry.chance, 0);
        const kept = odds.opening.composition.mulliganed;
        const spells = kept.mana.reduce((sum, group) => sum + group.expected, 0);

        expect(meanLands(odds.opening.mulliganed)).toBeGreaterThan(meanLands(odds.opening.first));
        expect(spells).toBeCloseTo(7 - meanLands(odds.opening.mulliganed), 10);
        expect(spells).toBeLessThan(mana.reduce((sum, group) => sum + group.expected, 0));
    });
});
