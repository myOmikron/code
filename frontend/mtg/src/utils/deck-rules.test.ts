import { describe, expect, it } from "vitest";
import {
    Visibility,
    type BracketRulesResponse,
    type DeckCardResponse,
    type DeckResponse,
    type FormatRulesResponse,
} from "src/api/generated";
import {
    checkBracket,
    checkDeck,
    deckRuleZero,
    hasRuleZero,
    houseRulesSummary,
    playedBracket,
    ruleZeroCount,
    ruleZeroSave,
    type DeckLegality,
    type RuleZeroForm,
    type SlotViolation,
} from "src/utils/deck-rules";

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
        houseRules: [],
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
        allow_banned: false,
        allow_duplicates: false,
        allow_extra_commanders: false,
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

/**
 * What a format asks, filled with Commander's rules
 *
 * @param overrides fields to set
 *
 * @returns the rules
 */
function formatRules(overrides: Partial<FormatRulesResponse> = {}): FormatRulesResponse {
    return {
        color_identity_locked: true,
        commander: { kind: "required", min: 1, max: 1 },
        deck_size: { kind: "exactly", cards: 100 },
        max_copies: 1,
        sideboard: 0,
        slug: "commander",
        ...overrides,
    };
}

/**
 * A Main-zone slot holding some number of copies of one card
 *
 * @param oracle the card's oracle id
 * @param name the card's name
 * @param quantity how many copies the slot holds
 * @param typeLine the card's type line, which is what tells a basic land apart
 *
 * @returns the slot
 */
function copiesSlot(oracle: string, name: string, quantity: number, typeLine = "Creature — Rat"): DeckCardResponse {
    return {
        card: {
            oracle_id: oracle,
            name,
            type_line: typeLine,
            color_identity: "",
            legal_formats: ["commander"],
        } as DeckCardResponse["card"],
        foil: false,
        printing: `${oracle}-printing`,
        quantity,
        tags: [],
        uuid: `${oracle}-slot`,
        zone: "Main" as DeckCardResponse["zone"],
    };
}

/**
 * A Main-zone slot for a card the catalog does not list as Commander-legal
 *
 * @param oracle the card's oracle id
 * @param name the card's name
 *
 * @returns the slot
 */
function bannedSlot(oracle: string, name: string): DeckCardResponse {
    return {
        card: {
            oracle_id: oracle,
            name,
            type_line: "Artifact",
            color_identity: "",
            legal_formats: ["vintage"],
        } as DeckCardResponse["card"],
        foil: false,
        printing: `${oracle}-printing`,
        quantity: 1,
        tags: [],
        uuid: `${oracle}-slot`,
        zone: "Main" as DeckCardResponse["zone"],
    };
}

/**
 * A command-zone slot holding one legendary creature
 *
 * @param oracle the card's oracle id
 * @param name the card's name
 *
 * @returns the slot
 */
function commanderSlot(oracle: string, name: string): DeckCardResponse {
    return {
        card: {
            oracle_id: oracle,
            name,
            type_line: "Legendary Creature — Human",
            color_identity: "W",
            legal_formats: ["commander"],
        } as DeckCardResponse["card"],
        foil: false,
        printing: `${oracle}-printing`,
        quantity: 1,
        tags: [],
        uuid: `${oracle}-slot`,
        zone: "Commander" as DeckCardResponse["zone"],
    };
}

/** Relentless Rats, whose text lets a deck hold any number of it */
const RELENTLESS_RATS = "104ea189-14cd-420f-afdc-57b0f827ab8e";
/** Seven Dwarves, whose text lets a deck hold seven of it and no more */
const SEVEN_DWARVES = "526ca4a9-3f50-4f7a-8169-2bda95792401";

/**
 * What `checkDeck` faults one slot for, read against Commander's rules
 *
 * @param slot the only slot in the deck
 *
 * @returns its remarks, empty when it has none
 */
function remarksFor(slot: DeckCardResponse): Array<SlotViolation> {
    return checkDeck(deckHeader(), [slot], formatRules()).slots.get(slot.uuid) ?? [];
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

    it("lets a card whose own text says so be played in any number", () => {
        const remarks = remarksFor(copiesSlot(RELENTLESS_RATS, "Relentless Rats", 21));
        expect(remarks.some((remark) => remark.kind === "too-many")).toBe(false);
    });

    it("holds a card that names a number to that number", () => {
        expect(remarksFor(copiesSlot(SEVEN_DWARVES, "Seven Dwarves", 8))).toContainEqual({
            kind: "too-many",
            copies: 8,
            allowed: 7,
        });
        const atSeven = remarksFor(copiesSlot(SEVEN_DWARVES, "Seven Dwarves", 7));
        expect(atSeven.some((remark) => remark.kind === "too-many")).toBe(false);
    });

    it("still faults an ordinary card at two copies in Commander", () => {
        expect(remarksFor(copiesSlot("oracle-sol-ring", "Sol Ring", 2))).toContainEqual({
            kind: "too-many",
            copies: 2,
            allowed: 1,
        });
    });

    it("leaves basic lands uncounted", () => {
        const remarks = remarksFor(copiesSlot("oracle-mountain", "Mountain", 30, "Basic Land — Mountain"));
        expect(remarks.some((remark) => remark.kind === "too-many")).toBe(false);
    });
});

describe("deckRuleZero", () => {
    it("reads the flags the deck carries", () => {
        expect(deckRuleZero(deckHeader({ allow_duplicates: true, deck_size: 60 }))).toStrictEqual({
            extraCommanders: false,
            duplicates: true,
            banned: false,
            deckSize: 60,
        });
    });

    it("says a deck played by the book records nothing", () => {
        expect(ruleZeroCount(deckHeader())).toBe(0);
        expect(hasRuleZero(deckHeader())).toBe(false);
    });

    it("counts the colour override as a deviation of its own", () => {
        expect(ruleZeroCount(deckHeader({ allowed_color_identity: "WU" }))).toBe(1);
        expect(hasRuleZero(deckHeader({ allowed_color_identity: "WU" }))).toBe(true);
    });

    it("counts every deviation a deck records, a colourless claim included", () => {
        const deck = deckHeader({
            allow_banned: true,
            allow_duplicates: true,
            allow_extra_commanders: true,
            allowed_color_identity: "",
            deck_size: 60,
        });
        expect(ruleZeroCount(deck)).toBe(5);
    });
});

/**
 * The Rule 0 dialog's form as it opens on a deck played by the book
 *
 * @param overrides what the reader changed
 *
 * @returns the form
 */
function ruleZeroForm(overrides: Partial<RuleZeroForm> = {}): RuleZeroForm {
    return {
        follow: true,
        colors: [],
        extraCommanders: false,
        duplicates: false,
        banned: false,
        deckSize: "",
        ...overrides,
    };
}

describe("ruleZeroSave", () => {
    it("asks for nothing when the form was not touched", () => {
        expect(ruleZeroSave(deckHeader(), ruleZeroForm())).toStrictEqual({});
    });

    it("writes only the colours when only the colours moved", () => {
        const save = ruleZeroSave(deckHeader(), ruleZeroForm({ follow: false, colors: ["G", "U"] }));
        expect(save).toStrictEqual({ colors: "UG" });
    });

    it("hands the colours back to the commander", () => {
        const deck = deckHeader({ allowed_color_identity: "UG" });
        expect(ruleZeroSave(deck, ruleZeroForm({ colors: ["U", "G"] }))).toStrictEqual({ colors: null });
    });

    it("writes only the house rules when only a switch moved", () => {
        const save = ruleZeroSave(deckHeader(), ruleZeroForm({ duplicates: true }));
        expect(save).toStrictEqual({
            rules: {
                allow_extra_commanders: false,
                allow_duplicates: true,
                allow_banned: false,
                deck_size: null,
            },
        });
    });

    it("writes both halves when both moved", () => {
        const save = ruleZeroSave(deckHeader(), ruleZeroForm({ follow: false, colors: ["W"], banned: true }));
        expect(save.colors).toBe("W");
        expect(save.rules?.allow_banned).toBe(true);
    });

    it("reads an empty size field as the format's own rule", () => {
        const save = ruleZeroSave(deckHeader({ deck_size: 60 }), ruleZeroForm({ deckSize: "" }));
        expect(save.rules?.deck_size).toBeNull();
        expect(save.colors).toBeUndefined();
    });

    it("keeps a size the deck already carries out of the request", () => {
        expect(ruleZeroSave(deckHeader({ deck_size: 60 }), ruleZeroForm({ deckSize: "60" }))).toStrictEqual({});
    });
});

describe("checkDeck under house rules", () => {
    it("waives the copy limit and says which card it covers", () => {
        const slot = copiesSlot("oracle-sol-ring", "Sol Ring", 2);
        const legality = checkDeck(deckHeader({ allow_duplicates: true }), [slot], formatRules());
        expect(legality.slots.get(slot.uuid) ?? []).toStrictEqual([]);
        expect(legality.houseRules).toContainEqual({ kind: "duplicates", cards: ["Sol Ring"] });
    });

    it("leaves a card its own text frees out of the agreed duplicates", () => {
        const slot = copiesSlot(RELENTLESS_RATS, "Relentless Rats", 21);
        const legality = checkDeck(deckHeader({ allow_duplicates: true }), [slot], formatRules());
        expect(legality.houseRules).toStrictEqual([]);
    });

    it("waives the format's legality and says which card it covers", () => {
        const slot = bannedSlot("oracle-black-lotus", "Black Lotus");
        const legality = checkDeck(deckHeader({ allow_banned: true }), [slot], formatRules());
        expect(legality.slots.get(slot.uuid) ?? []).toStrictEqual([]);
        expect(legality.houseRules).toContainEqual({ kind: "banned", cards: ["Black Lotus"] });
    });

    it("still faults a card the format does not list without the agreement", () => {
        const slot = bannedSlot("oracle-black-lotus", "Black Lotus");
        const legality = checkDeck(deckHeader(), [slot], formatRules());
        expect(legality.slots.get(slot.uuid)).toContainEqual({ kind: "not-legal" });
        expect(legality.houseRules).toStrictEqual([]);
    });

    it("measures the deck against the agreed size instead of the format's", () => {
        const legality = checkDeck(deckHeader({ deck_size: 60 }), [], formatRules());
        expect(legality.deck).toContainEqual({ kind: "deck-size", have: 0, want: 60, exact: true });
        expect(legality.houseRules).toContainEqual({ kind: "deck-size", want: 60 });
    });

    it("stops asking for the format's number once a size is agreed", () => {
        const sixty = copiesSlot("oracle-mountain", "Mountain", 60, "Basic Land — Mountain");
        const legality = checkDeck(deckHeader({ deck_size: 60 }), [sixty], formatRules());
        expect(legality.deck.some((violation) => violation.kind === "deck-size")).toBe(false);
    });

    it("seats more commanders than the format does", () => {
        const zone = [commanderSlot("oracle-tana", "Tana"), commanderSlot("oracle-tymna", "Tymna")];
        const legality = checkDeck(deckHeader({ allow_extra_commanders: true }), zone, formatRules());
        expect(legality.deck.some((violation) => violation.kind === "commander-count")).toBe(false);
        expect(legality.houseRules).toContainEqual({ kind: "commanders", have: 2 });
    });

    it("still remarks on an empty command zone", () => {
        const legality = checkDeck(deckHeader({ allow_extra_commanders: true }), [], formatRules());
        expect(legality.deck).toContainEqual({ kind: "commander-count", have: 0, min: 1, max: 1 });
        expect(legality.houseRules).toStrictEqual([]);
    });

    it("states the claimed colours", () => {
        const legality = checkDeck(deckHeader({ allowed_color_identity: "UG" }), [], formatRules());
        expect(legality.houseRules).toContainEqual({ kind: "colors", colors: "UG" });
    });

    it("says nothing about an agreement that is covering nothing", () => {
        const deck = deckHeader({ allow_banned: true, allow_duplicates: true, allow_extra_commanders: true });
        const legality = checkDeck(deck, [copiesSlot("oracle-sol-ring", "Sol Ring", 1)], formatRules());
        expect(legality.houseRules).toStrictEqual([]);
    });

    it("says nothing at all for a format without rules", () => {
        const deck = deckHeader({ allow_banned: true, allowed_color_identity: "U", deck_size: 60 });
        expect(checkDeck(deck, [], undefined).houseRules).toStrictEqual([]);
    });
});

describe("houseRulesSummary", () => {
    it("reads what the deck is playing under, in the order it is stated", () => {
        const deck = deckHeader({ allowed_color_identity: "R", deck_size: 60 });
        const cards = [copiesSlot("oracle-sol-ring", "Sol Ring", 1)];
        expect(houseRulesSummary(deck, cards, formatRules())).toStrictEqual([
            { kind: "colors", colors: "R" },
            { kind: "deck-size", want: 60 },
        ]);
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
