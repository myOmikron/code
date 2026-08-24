import { describe, expect, it } from "vitest";
import { Visibility, type BracketRulesResponse, type DeckCardResponse, type DeckResponse } from "src/api/generated";
import { checkBracket, checkDeck, playedBracket, type DeckLegality } from "src/utils/deck-rules";

/**
 * One bracket, named by number and given the rules it asks for
 *
 * @param number which bracket
 * @param rules what it tolerates
 *
 * @returns the bracket
 */
function bracket(number: number, rules: Partial<BracketRulesResponse> = {}): BracketRulesResponse {
    return {
        number,
        slug: `b${number}`,
        max_game_changers: null,
        mass_land_denial: true,
        extra_turns: true,
        two_card_combos: true,
        ...rules,
    };
}

/** The five brackets as the webserver states them */
const BRACKETS = [
    bracket(1, { max_game_changers: 0, mass_land_denial: false, extra_turns: false, two_card_combos: false }),
    bracket(2, { max_game_changers: 0, mass_land_denial: false, extra_turns: false, two_card_combos: false }),
    bracket(3, { max_game_changers: 3, mass_land_denial: false, extra_turns: false }),
    bracket(4),
    bracket(5),
];

/**
 * A counted deck, as far as the bracket rules read it
 *
 * @param counts what the catalog flagged
 *
 * @returns the legality
 */
function counted(counts: Partial<Pick<DeckLegality, "gameChangers" | "massLandDenial" | "extraTurns">>): DeckLegality {
    return {
        deck: [],
        slots: new Map(),
        allowedColors: [],
        colorsOverruled: false,
        cards: 100,
        gameChangers: [],
        massLandDenial: [],
        extraTurns: [],
        ...counts,
    };
}

/**
 * A deck header, filled with placeholder values `checkDeck` does not read
 * when called without format rules
 *
 * @param overrides fields to set
 *
 * @returns the deck
 */
function deckHeader(overrides: Partial<DeckResponse> = {}): DeckResponse {
    return {
        archived: false,
        created_at: "2024-01-01T00:00:00Z",
        format: "commander",
        name: "Test deck",
        uuid: "deck-1",
        visibility: Visibility.Private,
        ...overrides,
    };
}

/**
 * A Main-zone slot for a card the catalog flags as a Game Changer
 *
 * @param oracle the card's oracle id, shared by two printings of the same card
 * @param printing the printing id, so two calls can name two different prints
 *
 * @returns the slot
 */
function gameChangerSlot(oracle: string, printing: string): DeckCardResponse {
    return {
        card: { oracle_id: oracle, name: "Rhystic Study", game_changer: true } as DeckCardResponse["card"],
        foil: false,
        printing,
        quantity: 1,
        tags: [],
        uuid: printing,
        zone: "Main" as DeckCardResponse["zone"],
    };
}

describe("checkDeck", () => {
    it("dedupes Game Changers by oracle id, not by printing", () => {
        const legality = checkDeck(
            deckHeader(),
            [gameChangerSlot("oracle-1", "printing-1"), gameChangerSlot("oracle-1", "printing-2")],
            undefined,
        );
        expect(legality.gameChangers).toEqual(["Rhystic Study"]);
    });
});

describe("checkBracket", () => {
    it("reads every rule, kept ones included", () => {
        const checks = checkBracket(counted({}), BRACKETS[2]);
        expect(checks.map((check) => check.kind)).toStrictEqual(["game-changers", "mass-land-denial", "extra-turns"]);
        expect(checks.every((check) => check.kept)).toBe(true);
    });

    it("counts the Game Changers against the bracket's ceiling", () => {
        const checks = checkBracket(counted({ gameChangers: ["Rhystic Study", "Cyclonic Rift"] }), BRACKETS[2]);
        expect(checks[0]).toStrictEqual({
            kind: "game-changers",
            kept: true,
            have: 2,
            allowed: 3,
            cards: ["Rhystic Study", "Cyclonic Rift"],
        });
        expect(checkBracket(counted({ gameChangers: ["Rhystic Study", "Cyclonic Rift"] }), BRACKETS[1])[0].kept).toBe(
            false,
        );
    });

    it("reads a tolerated rule as no limit at all", () => {
        const checks = checkBracket(
            counted({ massLandDenial: ["Armageddon"], extraTurns: ["Time Warp"] }),
            BRACKETS[3],
        );
        expect(checks.map((check) => check.allowed)).toStrictEqual([null, null, null]);
        expect(checks.every((check) => check.kept)).toBe(true);
    });

    it("breaks on a single card the bracket plays none of", () => {
        const checks = checkBracket(counted({ massLandDenial: ["Armageddon"] }), BRACKETS[2]);
        expect(checks[1]).toStrictEqual({
            kind: "mass-land-denial",
            kept: false,
            have: 1,
            allowed: 0,
            cards: ["Armageddon"],
        });
    });
});

describe("playedBracket", () => {
    it("puts a deck that breaks nothing in the lowest bracket", () => {
        expect(playedBracket(counted({}), BRACKETS)).toBe(1);
    });

    it("climbs to the first bracket that tolerates what the deck plays", () => {
        expect(playedBracket(counted({ gameChangers: ["Rhystic Study"] }), BRACKETS)).toBe(3);
        expect(playedBracket(counted({ gameChangers: ["a", "b", "c", "d"] }), BRACKETS)).toBe(4);
        expect(playedBracket(counted({ extraTurns: ["Time Warp"] }), BRACKETS)).toBe(4);
    });

    it("says nothing for a format without brackets", () => {
        expect(playedBracket(counted({}), [])).toBeNull();
    });
});
