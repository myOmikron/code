import { describe, expect, it } from "vitest";
import type { DeckCardResponse, DeckTagResponse } from "src/api/generated";
import { groupDeck } from "src/utils/deck-grouping";

const RAMP: DeckTagResponse = { uuid: "tag-ramp", name: "Ramp", color: "lime", icon: "ramp", deck: null };
const WINCON: DeckTagResponse = {
    uuid: "tag-wincon",
    name: "Wincon",
    color: "fuchsia",
    icon: "trophy",
    deck: "deck",
};

/**
 * A slot, with only what the grouping reads
 *
 * @param uuid the slot's id
 * @param zone which zone it sits in
 * @param tags the tags on it
 *
 * @returns the slot
 */
function slot(uuid: string, zone: DeckCardResponse["zone"], tags: Array<string>): DeckCardResponse {
    return {
        uuid,
        printing: `printing-${uuid}`,
        quantity: 1,
        zone,
        tags,
        card: null,
    } as unknown as DeckCardResponse;
}

describe("groupDeck by tag", () => {
    const cards = [
        slot("commander", "Commander", []),
        slot("sol-ring", "Main", [RAMP.uuid]),
        slot("thoracle", "Main", [RAMP.uuid, WINCON.uuid]),
        slot("island", "Main", []),
        slot("sideboard", "Side", [RAMP.uuid]),
        slot("maybe", "Maybe", []),
    ];

    it("keeps the zones outside the deck to themselves", () => {
        const groups = groupDeck(cards, "tag", "name", [RAMP, WINCON]);
        const keys = groups.map((group) => group.key);

        expect(keys).toStrictEqual(["zone:Commander", RAMP.uuid, WINCON.uuid, "untagged", "zone:Side", "zone:Maybe"]);
    });

    it("counts a tagged card outside the deck only in its zone", () => {
        const groups = groupDeck(cards, "tag", "name", [RAMP, WINCON]);
        const ramp = groups.find((group) => group.key === RAMP.uuid);

        expect(ramp?.cards.map((card) => card.uuid)).toStrictEqual(["sol-ring", "thoracle"]);
        expect(groups.find((group) => group.key === "zone:Side")?.cards).toHaveLength(1);
    });

    it("lists a card with several tags under each of them", () => {
        const groups = groupDeck(cards, "tag", "name", [RAMP, WINCON]);

        expect(groups.find((group) => group.key === WINCON.uuid)?.cards.map((card) => card.uuid)).toStrictEqual([
            "thoracle",
        ]);
    });

    it("puts what carries no tag under one heading", () => {
        const groups = groupDeck(cards, "tag", "name", [RAMP, WINCON]);

        expect(groups.find((group) => group.key === "untagged")?.cards.map((card) => card.uuid)).toStrictEqual([
            "island",
        ]);
    });
});
