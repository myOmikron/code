/**
 * What a format asks of a deck, checked against what is in it.
 *
 * Everything here warns and nothing blocks. A deck under construction is
 * illegal most of the time, house rules exist, and a commander that grants the
 * deck a colour outside its own identity is a card the service has never heard
 * of — so the answer is a list of remarks, not a verdict.
 */

import type { BracketRulesResponse, DeckCardResponse, DeckResponse, FormatRulesResponse } from "src/api/generated";
import { isBasicLand } from "src/utils/card-types";

/** The colours, in the order they are written */
const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/** What is wrong with one slot */
export type SlotViolation =
    /** The catalog does not list the card as legal in this format */
    | { kind: "not-legal" }
    /** More copies than the format allows, counted over every printing of the card */
    | { kind: "too-many"; copies: number; allowed: number }
    /** A colour the deck may not play */
    | { kind: "color-identity"; colors: string };

/** What is wrong with the deck as a whole */
export type DeckViolation =
    /** More Game Changers than the claimed bracket allows */
    | { kind: "game-changers"; have: number; allowed: number }
    /** Mass land denial in a bracket that plays none */
    | { kind: "mass-land-denial"; cards: Array<string> }
    /** Extra-turn spells in a bracket that plays none */
    | { kind: "extra-turns"; cards: Array<string> }
    /** Too few or too many cards */
    | { kind: "deck-size"; have: number; want: number; exact: boolean }
    /** No commander, or too many */
    | { kind: "commander-count"; have: number; min: number; max: number }
    /** More cards in the sideboard than allowed */
    | { kind: "sideboard-size"; have: number; allowed: number };

/** Everything the legality band draws */
export type DeckLegality = {
    /** What is wrong with the deck as a whole */
    deck: Array<DeckViolation>;
    /** What is wrong per slot, keyed by the slot's uuid */
    slots: Map<string, Array<SlotViolation>>;
    /** The colours the deck may play, derived or overruled */
    allowedColors: Array<string>;
    /** Whether those colours came from the deck rather than from its commander */
    colorsOverruled: boolean;
    /** How many cards are in the deck, commander included */
    cards: number;
    /** The Game Changers the deck plays, by name */
    gameChangers: Array<string>;
    /** The mass land denial the deck plays, by name */
    massLandDenial: Array<string>;
    /** The extra-turn spells the deck plays, by name */
    extraTurns: Array<string>;
};

/**
 * The names of the distinct oracle cards among a set of slots.
 *
 * Two printings of the same card share an oracle id, so they collapse to one
 * name here — a slot-per-printing count would report a card twice for owning
 * two arts of it, and hand the caller a duplicate React key besides.
 *
 * @param slots the slots to dedupe
 *
 * @returns the names, one per oracle id, sorted
 */
function uniqueNames(slots: Array<DeckCardResponse>): Array<string> {
    const byOracle = new Map<string, string>();
    for (const slot of slots) {
        const oracle = slot.card?.oracle_id;
        if (oracle != null && !byOracle.has(oracle)) byOracle.set(oracle, slot.card?.name ?? "");
    }
    return [...byOracle.values()].sort((left, right) => left.localeCompare(right));
}

/**
 * Check a deck against its format
 *
 * @param deck the deck
 * @param cards its slots
 * @param rules what the format asks, `undefined` for a format without rules
 * @param bracket what the claimed Commander bracket asks, `undefined` when none is claimed
 *
 * @returns the remarks
 */
export function checkDeck(
    deck: DeckResponse,
    cards: Array<DeckCardResponse>,
    rules: FormatRulesResponse | undefined,
    bracket?: BracketRulesResponse,
): DeckLegality {
    const counted = cards.filter((card) => card.zone === "Main" || card.zone === "Commander");
    const commanders = cards.filter((card) => card.zone === "Commander");
    const sideboard = cards.filter((card) => card.zone === "Side");

    const cardCount = counted.reduce((sum, card) => sum + card.quantity, 0);
    // Deduped per oracle card rather than per printing: a deck can hold two
    // printings of the same Game Changer, and the bracket counts the card
    // once, not the copies.
    const gameChangers = uniqueNames(counted.filter((card) => card.card?.game_changer === true));
    // Same counting rule as the Game Changers above, and the same source:
    // both are catalog flags, so the band never reads rules text itself.
    const named = (flag: "mass_land_denial" | "extra_turns") =>
        uniqueNames(counted.filter((card) => card.card?.[flag] === true));
    const massLandDenial = named("mass_land_denial");
    const extraTurns = named("extra_turns");
    const overruled = deck.allowed_color_identity != null;
    const allowedColors = overruled ? letters(deck.allowed_color_identity ?? "") : commanderColors(commanders);

    const slots = new Map<string, Array<SlotViolation>>();
    const deckViolations: Array<DeckViolation> = [];

    if (bracket?.max_game_changers != null && gameChangers.length > bracket.max_game_changers) {
        deckViolations.push({
            kind: "game-changers",
            have: gameChangers.length,
            allowed: bracket.max_game_changers,
        });
    }

    // The bracket says whether it tolerates these at all; the catalog says
    // which cards are them. Detection errs toward silence, so an absent
    // warning means "nothing detected", never "nothing there".
    if (bracket?.mass_land_denial === false && massLandDenial.length > 0) {
        deckViolations.push({ kind: "mass-land-denial", cards: massLandDenial });
    }
    if (bracket?.extra_turns === false && extraTurns.length > 0) {
        deckViolations.push({ kind: "extra-turns", cards: extraTurns });
    }

    if (rules === undefined) {
        return {
            deck: deckViolations,
            slots,
            allowedColors,
            colorsOverruled: overruled,
            cards: cardCount,
            gameChangers,
            massLandDenial,
            extraTurns,
        };
    }

    // Copies are counted per oracle card: four different printings of the same
    // card are four copies of it, which is exactly what a format limits.
    const copiesPerOracle = new Map<string, number>();
    for (const card of counted) {
        const oracle = card.card?.oracle_id;
        if (oracle == null || card.card == null || isBasicLand(card.card.type_line)) continue;
        copiesPerOracle.set(oracle, (copiesPerOracle.get(oracle) ?? 0) + card.quantity);
    }

    for (const slot of cards) {
        if (slot.zone === "Maybe") continue;
        const card = slot.card;
        if (card == null) continue;

        const remarks: Array<SlotViolation> = [];

        if (!card.legal_formats.includes(deck.format)) {
            remarks.push({ kind: "not-legal" });
        }

        const copies = card.oracle_id == null ? 0 : (copiesPerOracle.get(card.oracle_id) ?? 0);
        if (copies > rules.max_copies) {
            remarks.push({ kind: "too-many", copies, allowed: rules.max_copies });
        }

        if (rules.color_identity_locked && slot.zone !== "Commander" && allowedColors.length > 0) {
            const outside = letters(card.color_identity).filter((color) => !allowedColors.includes(color));
            if (outside.length > 0) {
                remarks.push({ kind: "color-identity", colors: outside.join("") });
            }
        }

        if (remarks.length > 0) slots.set(slot.uuid, remarks);
    }

    const wanted = rules.deck_size.cards;
    const exact = rules.deck_size.kind === "exactly";
    if (exact ? cardCount !== wanted : cardCount < wanted) {
        deckViolations.push({ kind: "deck-size", have: cardCount, want: wanted, exact });
    }

    if (rules.commander.kind === "required") {
        const inZone = commanders.reduce((sum, card) => sum + card.quantity, 0);
        if (inZone < rules.commander.min || inZone > rules.commander.max) {
            deckViolations.push({
                kind: "commander-count",
                have: inZone,
                min: rules.commander.min,
                max: rules.commander.max,
            });
        }
    }

    // Zero really means no sideboard. Commander used to treat this zone as a
    // maybeboard, but that made a rule-defined absence behave like permission.
    const inSideboard = sideboard.reduce((sum, card) => sum + card.quantity, 0);
    if (inSideboard > rules.sideboard) {
        deckViolations.push({ kind: "sideboard-size", have: inSideboard, allowed: rules.sideboard });
    }

    return {
        deck: deckViolations,
        slots,
        allowedColors,
        colorsOverruled: overruled,
        cards: cardCount,
        gameChangers,
        massLandDenial,
        extraTurns,
    };
}

/**
 * The colours a commander zone allows
 *
 * @param commanders the slots in the command zone
 *
 * @returns the colour letters, in `WUBRG` order
 */
export function commanderColors(commanders: Array<DeckCardResponse>): Array<string> {
    const colors = new Set<string>();
    for (const commander of commanders) {
        for (const color of letters(commander.card?.color_identity ?? "")) colors.add(color);
    }
    return COLOR_LETTERS.filter((color) => colors.has(color));
}

/**
 * Split a colour identity into its letters, in `WUBRG` order
 *
 * @param identity the stored string
 *
 * @returns the letters
 */
export function letters(identity: string): Array<string> {
    const upper = identity.toUpperCase();
    return COLOR_LETTERS.filter((color) => upper.includes(color));
}

/** One of a bracket's rules, read against the deck */
export type BracketRuleCheck = {
    /** Which rule this is */
    kind: "game-changers" | "mass-land-denial" | "extra-turns";
    /** Whether the deck keeps to it */
    kept: boolean;
    /** How many of the cards the rule names are in the deck */
    have: number;
    /** How many it may play, `null` when the bracket sets no limit */
    allowed: number | null;
    /** The cards behind the count, by name */
    cards: Array<string>;
};

/**
 * Read one bracket's rules against a deck that has already been counted.
 *
 * Every rule comes back, kept or broken: a band that only lists what is wrong
 * cannot say a deck is inside its bracket, which is the more common answer and
 * the one worth showing.
 *
 * @param legality what {@link checkDeck} counted
 * @param rules what the bracket asks
 *
 * @returns one entry per rule, in the order they are drawn
 */
export function checkBracket(legality: DeckLegality, rules: BracketRulesResponse): Array<BracketRuleCheck> {
    /**
     * One rule, against the cards the catalog flagged for it
     *
     * @param kind which rule
     * @param cards the flagged cards
     * @param allowed how many are tolerated, `null` for no limit
     *
     * @returns the check
     */
    const read = (kind: BracketRuleCheck["kind"], cards: Array<string>, allowed: number | null): BracketRuleCheck => ({
        kind,
        kept: allowed === null || cards.length <= allowed,
        have: cards.length,
        allowed,
        cards,
    });

    return [
        read("game-changers", legality.gameChangers, rules.max_game_changers ?? null),
        // A bracket that tolerates these sets no number, so the rule reads as
        // "none" or as no limit at all — never as a count.
        read("mass-land-denial", legality.massLandDenial, rules.mass_land_denial ? null : 0),
        read("extra-turns", legality.extraTurns, rules.extra_turns ? null : 0),
    ];
}

/**
 * The lowest bracket whose rules the deck actually keeps.
 *
 * What the deck plays as, against what it claims. Only the rules the catalog
 * can answer are read — two-card combos are not among them, and a deck that
 * plays one sits a bracket higher than this says. The advisor's combo section
 * is where that half of the question is answered.
 *
 * @param legality what {@link checkDeck} counted
 * @param brackets the brackets on offer
 *
 * @returns the bracket number, or `null` for a format without brackets
 */
export function playedBracket(legality: DeckLegality, brackets: Array<BracketRulesResponse>): number | null {
    const climbing = [...brackets].sort((left, right) => left.number - right.number);
    const fits = climbing.find((rules) => checkBracket(legality, rules).every((check) => check.kept));
    return fits?.number ?? null;
}
