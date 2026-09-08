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
    detectedBracket,
    hasRuleZero,
    houseRulesSummary,
    playedBracket,
    ruleZeroCount,
    ruleZeroSave,
    type BracketCounts,
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
        extra_turns: "any",
        combos: "any",
        ...rules,
    };
}

/** The five brackets as the webserver states them */
const BRACKETS = [
    bracket(1, { max_game_changers: 0, mass_land_denial: false, extra_turns: "none", combos: "none" }),
    bracket(2, { max_game_changers: 0, mass_land_denial: false, extra_turns: "no-chaining", combos: "no-two-card" }),
    bracket(3, { max_game_changers: 3, mass_land_denial: false, extra_turns: "no-chaining" }),
    bracket(4),
    bracket(5),
];

/**
 * The two rungs whose rules differ by more than a number, named rather than
 * indexed: every combo and extra-turn case below turns on which of them it
 * reads against, and `BRACKETS[1]` is bracket 2, which is one off from what
 * anyone writing such a test means.
 */
const [EXHIBITION, CORE] = BRACKETS;

/**
 * A counted deck, as far as the bracket rules read it
 *
 * @param counts what the catalog flagged
 *
 * @returns the legality
 */
function counted(counts: Partial<BracketCounts>): DeckLegality {
    return {
        deck: [],
        slots: new Map(),
        allowedColors: [],
        colorsOverruled: false,
        cards: 100,
        gameChangers: [],
        massLandDenial: [],
        extraTurns: [],
        // Derived by `checkDeck` from the extra-turn cards, so a fixture that
        // names two of them without saying so would be a deck that cannot be
        // built.
        chainsExtraTurns: (counts.extraTurns ?? []).length > 1,
        combos: null,
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
        proxy: false,
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
        has_brackets: true,
        commander: { kind: "required", min: 1, max: 1 },
        deck_size: { kind: "exactly", cards: 100 },
        max_copies: 1,
        // Commander publishes none of these, and the formats that do have them
        // fetched rather than declared — so the default is "nothing to say".
        role_bans: { commander: [], partner: [], companion: [], pairings: [] },
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
        proxy: false,
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
        proxy: false,
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
        proxy: false,
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
    it("leaves the combo rule out while its answer is missing", () => {
        const checks = checkBracket(counted({}), BRACKETS[2]);
        expect(checks.map((check) => check.kind)).toStrictEqual(["game-changers", "mass-land-denial", "extra-turns"]);
        expect(checks.every((check) => check.kept)).toBe(true);
    });

    it("reads the combo rule once the graph has answered, an empty answer included", () => {
        const checks = checkBracket(counted({ combos: [] }), EXHIBITION);
        expect(checks.map((check) => check.kind)).toStrictEqual([
            "game-changers",
            "mass-land-denial",
            "extra-turns",
            "combos",
        ]);
        expect(checks[3]).toStrictEqual({
            kind: "combos",
            kept: true,
            have: 0,
            allowed: 0,
            cards: [],
            names: [],
            step: "none",
            breaking: 0,
        });
    });

    it("breaks a combo-free bracket on one complete combo, named by its pieces", () => {
        const combo = ["Thassa's Oracle", "Demonic Consultation"];
        const checks = checkBracket(counted({ combos: [combo] }), EXHIBITION);
        expect(checks[3]).toStrictEqual({
            kind: "combos",
            kept: false,
            have: 1,
            allowed: 0,
            cards: ["Thassa's Oracle + Demonic Consultation"],
            // The rule counts combos; a click filters to cards, so the
            // filterable names are the pieces themselves.
            names: ["Thassa's Oracle", "Demonic Consultation"],
            step: "none",
            breaking: 1,
        });
    });

    it("counts only the pairs where the bracket asks for two cards", () => {
        const combos = [
            ["Devoted Druid", "Vizier of Remedies", "Walking Ballista"],
            ["Kinnan, Bonder Prodigy", "Basalt Monolith"],
        ];
        // Exhibition plays no intentional infinite combo at all, so both count.
        expect(checkBracket(counted({ combos }), EXHIBITION)[3]).toMatchObject({
            kept: false,
            have: 2,
            breaking: 2,
            step: "none",
        });

        // Core counts only the pair, and the three-card line on its own is
        // exactly what keeps a deck off Exhibition without moving it off Core.
        expect(checkBracket(counted({ combos }), CORE)[3]).toMatchObject({
            kept: false,
            have: 2,
            breaking: 1,
            step: "limited",
        });
        expect(checkBracket(counted({ combos: [combos[0]] }), EXHIBITION)[3].kept).toBe(false);
        expect(checkBracket(counted({ combos: [combos[0]] }), CORE)[3].kept).toBe(true);
    });

    it("tolerates combos where the bracket does", () => {
        const checks = checkBracket(counted({ combos: [["A", "B"]] }), BRACKETS[2]);
        expect(checks[3]).toMatchObject({ kind: "combos", kept: true, allowed: null, step: "any" });
    });

    it("counts the Game Changers against the bracket's ceiling", () => {
        const checks = checkBracket(counted({ gameChangers: ["Rhystic Study", "Cyclonic Rift"] }), BRACKETS[2]);
        expect(checks[0]).toStrictEqual({
            kind: "game-changers",
            kept: true,
            have: 2,
            allowed: 3,
            cards: ["Rhystic Study", "Cyclonic Rift"],
            names: ["Rhystic Study", "Cyclonic Rift"],
            step: "limited",
            breaking: 0,
        });
        expect(
            checkBracket(counted({ gameChangers: ["Rhystic Study", "Cyclonic Rift"] }), BRACKETS[1])[0],
        ).toMatchObject({ kept: false, breaking: 2 });
    });

    it("reads a tolerated rule as no limit at all", () => {
        const checks = checkBracket(
            counted({ massLandDenial: ["Armageddon"], extraTurns: ["Time Warp", "Temporal Manipulation"] }),
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
            names: ["Armageddon"],
            step: "none",
            breaking: 1,
        });
    });

    it("seats an extra turn that cannot be chained, and faults the chain", () => {
        // Exhibition plays none at all, so one is already too many there.
        expect(checkBracket(counted({ extraTurns: ["Time Warp"] }), BRACKETS[0])[2]).toMatchObject({
            kept: false,
            step: "none",
            breaking: 1,
        });
        // Core asks only that they cannot follow one another.
        expect(checkBracket(counted({ extraTurns: ["Time Warp"] }), BRACKETS[1])[2]).toMatchObject({
            kept: true,
            have: 1,
            step: "limited",
            breaking: 0,
        });
        expect(
            checkBracket(counted({ extraTurns: ["Time Warp", "Temporal Manipulation"] }), BRACKETS[1])[2],
        ).toMatchObject({ kept: false, have: 2, step: "limited", breaking: 2 });
    });
});

describe("playedBracket", () => {
    it("puts a deck that breaks nothing in the lowest bracket", () => {
        expect(playedBracket(counted({}), BRACKETS)).toBe(1);
    });

    it("climbs to the first bracket that tolerates what the deck plays", () => {
        expect(playedBracket(counted({ gameChangers: ["Rhystic Study"] }), BRACKETS)).toBe(3);
        expect(playedBracket(counted({ gameChangers: ["a", "b", "c", "d"] }), BRACKETS)).toBe(4);
        // One extra turn is a Core card; two are a chain, which only bracket 4
        // seats.
        expect(playedBracket(counted({ extraTurns: ["Time Warp"] }), BRACKETS)).toBe(2);
        expect(playedBracket(counted({ extraTurns: ["Time Warp", "Capture of Jingzhou"] }), BRACKETS)).toBe(4);
    });

    it("climbs on a complete two-card combo, and only on an answered one", () => {
        expect(playedBracket(counted({ combos: [["A", "B"]] }), BRACKETS)).toBe(3);
        expect(playedBracket(counted({ combos: null }), BRACKETS)).toBe(1);
    });

    it("moves a three-card combo off Exhibition but no further", () => {
        expect(playedBracket(counted({ combos: [["A", "B", "C"]] }), BRACKETS)).toBe(2);
    });

    it("says nothing for a format without brackets", () => {
        expect(playedBracket(counted({}), [])).toBeNull();
    });
});

describe("the ladder a bracket falls back to", () => {
    it("reads the served rule when it is one of the three steps", () => {
        expect(checkBracket(counted({ extraTurns: ["a", "b"] }), CORE)[2].kept).toBe(false);
        expect(checkBracket(counted({ extraTurns: ["a", "b"] }), BRACKETS[3])[2].kept).toBe(true);
    });

    it("falls back to what that rung is known to ask when the rule is not", () => {
        // What a service one release behind sends: the two three-step rules as
        // the yes/no they used to be, and no combo rule at all. The ladder is
        // published, so the answer is the same as above rather than a shrug.
        const stale = (number: number) =>
            ({
                number,
                slug: `b${number}`,
                max_game_changers: number >= 4 ? null : number === 3 ? 3 : 0,
                mass_land_denial: number >= 4,
                extra_turns: number >= 4,
            }) as unknown as BracketRulesResponse;

        const core = checkBracket(counted({ extraTurns: ["a", "b"], combos: [["A", "B"]] }), stale(2));
        expect(core[2]).toMatchObject({ kind: "extra-turns", kept: false, step: "limited" });
        expect(core[3]).toMatchObject({ kind: "combos", kept: false, step: "limited" });

        // cEDH seats both, which is the case that read as a fault before the
        // ladder was known: nothing on the rung is a restriction.
        const cedh = checkBracket(counted({ extraTurns: ["a", "b"], combos: [["A", "B"]] }), stale(5));
        expect(cedh[2]).toMatchObject({ kind: "extra-turns", kept: true, step: "any" });
        expect(cedh[3]).toMatchObject({ kind: "combos", kept: true, step: "any" });
    });

    it("never invents a restriction for a rung it does not know", () => {
        const seven = {
            number: 7,
            slug: "b7",
            max_game_changers: null,
            mass_land_denial: true,
        } as unknown as BracketRulesResponse;
        expect(
            checkBracket(counted({ extraTurns: ["a", "b"], combos: [["A", "B"]] }), seven).every((c) => c.kept),
        ).toBe(true);
    });

    it("always finds a rung, so a claimed deck is never told it plays as none", () => {
        const stale = BRACKETS.map(
            (rules) =>
                ({
                    number: rules.number,
                    slug: rules.slug,
                    max_game_changers: rules.max_game_changers,
                    mass_land_denial: rules.mass_land_denial,
                    extra_turns: rules.number >= 4,
                }) as unknown as BracketRulesResponse,
        );
        expect(playedBracket(counted({ extraTurns: ["a", "b"], combos: [["A", "B"]] }), stale)).toBe(4);
    });
});

describe("detectedBracket", () => {
    it("never claims the bracket that is a statement of intent", () => {
        // Exhibition is a themed pile and cEDH is a tournament deck; no list
        // of cards proves either, so detection stays between them.
        expect(detectedBracket(counted({}), BRACKETS)).toBe(2);
        expect(detectedBracket(counted({ massLandDenial: ["Armageddon"] }), BRACKETS)).toBe(4);
    });

    it("claims what the deck plays as in between", () => {
        expect(detectedBracket(counted({ gameChangers: ["Rhystic Study"] }), BRACKETS)).toBe(3);
    });

    it("says nothing for a format without brackets", () => {
        expect(detectedBracket(counted({}), [])).toBeNull();
    });
});

describe("checkDeck against a claimed bracket's combo rule", () => {
    it("faults a combo the claimed bracket plays none of", () => {
        const combos = [["Thassa's Oracle", "Demonic Consultation"]];
        const legality = checkDeck(deckHeader(), [], formatRules(), BRACKETS[1], combos);
        expect(legality.deck).toContainEqual({ kind: "combos", combos });
        expect(legality.combos).toStrictEqual(combos);
    });

    it("does not fault what the claimed bracket tolerates", () => {
        const legality = checkDeck(deckHeader(), [], formatRules(), BRACKETS[2], [["A", "B"]]);
        expect(legality.deck.some((violation) => violation.kind === "combos")).toBe(false);
    });

    it("never faults an unanswered question", () => {
        const legality = checkDeck(deckHeader(), [], formatRules(), BRACKETS[1]);
        expect(legality.deck.some((violation) => violation.kind === "combos")).toBe(false);
        expect(legality.combos).toBeNull();
    });

    it("carries the answer even for a format without rules", () => {
        expect(checkDeck(deckHeader(), [], undefined, BRACKETS[1], []).combos).toStrictEqual([]);
    });
});
