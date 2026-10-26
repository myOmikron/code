import { describe, expect, it } from "vitest";
import type {
    BracketRulesResponse,
    DeckCardResponse,
    RegisteredListResponse,
    FormatRulesResponse,
} from "src/api/generated";
import { registeredListWarnings } from "src/utils/tournament-registered-lists";

/** A sixty-card format: four copies, no commander */
const MODERN: FormatRulesResponse = {
    color_identity_locked: false,
    has_brackets: false,
    commander: { kind: "none" },
    deck_size: { kind: "at_least", cards: 4 },
    max_copies: 4,
    role_bans: { commander: [], partner: [], companion: [], pairings: [] },
    sideboard: 15,
    slug: "modern",
};

/** Commander, with brackets */
const COMMANDER: FormatRulesResponse = {
    color_identity_locked: true,
    has_brackets: true,
    commander: { kind: "required", min: 1, max: 1 },
    deck_size: { kind: "exactly", cards: 100 },
    max_copies: 1,
    role_bans: { commander: [], partner: [], companion: [], pairings: [] },
    sideboard: 0,
    slug: "commander",
};

/** Bracket 2, which plays no Game Changer */
const CORE: BracketRulesResponse = {
    number: 2,
    slug: "core",
    max_game_changers: 0,
    mass_land_denial: false,
    extra_turns: "no-chaining",
    combos: "no-two-card",
};

/**
 * A Main-zone slot of four copies of one card
 *
 * @param name the card's name
 * @param legal the formats the catalog lists it as legal in
 * @param gameChanger whether the catalog flags it as a Game Changer
 *
 * @returns the slot
 */
function slot(name: string, legal: Array<string>, gameChanger = false): DeckCardResponse {
    return {
        card: {
            oracle_id: `${name}-oracle`,
            name,
            type_line: "Instant",
            color_identity: "",
            legal_formats: legal,
            game_changer: gameChanger,
        } as DeckCardResponse["card"],
        foil: false,
        proxy: false,
        printing: `${name}-printing`,
        quantity: 4,
        tags: [],
        uuid: `${name}-slot`,
        zone: "Main" as DeckCardResponse["zone"],
    };
}

/**
 * A Registered deck's list in modern holding four Lightning Bolts
 *
 * @param overrides fields to set
 *
 * @returns the list
 */
function list(overrides: Partial<RegisteredListResponse> = {}): RegisteredListResponse {
    return {
        participant: "participant-1",
        deck: "deck-1",
        name: "Burn",
        format: "modern",
        bracket: null,
        allowed_color_identity: null,
        allow_extra_commanders: false,
        allow_duplicates: false,
        allow_banned: false,
        deck_size: null,
        shared: false,
        pinned: true,
        cards: [slot("Lightning Bolt", ["modern", "pauper"])],
        ...overrides,
    };
}

describe("registeredListWarnings", () => {
    it("says nothing about a legal deck in the Tournament's format", () => {
        expect(registeredListWarnings(list(), "modern", [MODERN], [])).toEqual([]);
    });

    it("warns when the deck is built for another format", () => {
        const warnings = registeredListWarnings(list({ format: "pauper" }), "modern", [MODERN], []);

        expect(warnings).toEqual([{ kind: "format", format: "pauper" }]);
    });

    it("reads the cards against the Tournament's format, not the deck's", () => {
        const pauper = list({ format: "pauper", cards: [slot("Hymn", ["pauper"])] });

        const warnings = registeredListWarnings(pauper, "modern", [MODERN], []);

        expect(warnings).toContainEqual({ kind: "legality", remarks: 1 });
    });

    it("warns about a card the Tournament's format does not allow", () => {
        const banned = list({ cards: [slot("Mox Opal", ["vintage"])] });

        expect(registeredListWarnings(banned, "modern", [MODERN], [])).toEqual([{ kind: "legality", remarks: 1 }]);
    });

    it("lets a house rule the table agreed to cover the card", () => {
        const agreed = list({ allow_banned: true, cards: [slot("Mox Opal", ["vintage"])] });

        expect(registeredListWarnings(agreed, "modern", [MODERN], [])).toEqual([]);
    });

    it("checks a Tournament without a format against the deck's own", () => {
        const pauper = list({ format: "pauper", cards: [slot("Hymn", ["pauper"])] });

        expect(registeredListWarnings(pauper, null, [MODERN], [])).toEqual([]);
    });

    it("warns about the bracket rules the claimed bracket breaks", () => {
        const deck = list({
            format: "commander",
            bracket: 2,
            cards: [slot("Rhystic Study", ["commander"], true)],
        });

        const warnings = registeredListWarnings(deck, "commander", [COMMANDER], [CORE]);

        expect(warnings).toContainEqual({ kind: "bracket", bracket: 2, rules: ["game-changers"] });
    });
});
