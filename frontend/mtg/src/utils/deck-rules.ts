/**
 * What a format asks of a deck, checked against what is in it.
 *
 * Everything here warns and nothing blocks. A deck under construction is
 * illegal most of the time, house rules exist, and a commander that grants the
 * deck a colour outside its own identity is a card the service has never heard
 * of — so the answer is a list of remarks, not a verdict.
 */

import type {
    BracketRulesResponse,
    ComboRule,
    DeckCardResponse,
    DeckResponse,
    ExtraTurnRule,
    FormatRulesResponse,
    RoleBansResponse,
    SetDeckRuleZeroRequest,
} from "src/api/generated";
import { isBasicLand } from "src/utils/card-types";

/** The colours, in the order they are written */
export const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/**
 * The cards whose own rules text overrules a format's copy limit, by oracle id.
 *
 * Keyed on the oracle id rather than the name or the text: a slot's catalog
 * entry carries the id but never the oracle text, so a regex over the rules is
 * not on offer, and the id is the one handle that survives every printing and
 * every language the card was ever printed in.
 *
 * Refreshed from Scryfall with
 * `https://api.scryfall.com/cards/search?q=oracle%3A%22a+deck+can+have%22+game%3Apaper&unique=cards`,
 * reading each hit's text: "any number" is no limit at all, and the two cards
 * that name a number set that number. Hits that narrow a deck instead of
 * freeing it — Once More with Feeling, held to one copy — do not belong here.
 */
const NAMED_COPY_EXCEPTIONS: ReadonlyMap<string, number> = new Map([
    ["87050537-99c9-4993-a770-4329b2e749e4", Number.POSITIVE_INFINITY], // Cid, Timeless Artificer
    ["47e191f7-6314-4875-b5ee-57e5daf089c4", Number.POSITIVE_INFINITY], // Dragon's Approach
    ["3c1619bd-db5e-4df6-a196-0a9d62374f6d", Number.POSITIVE_INFINITY], // Hare Apparent
    ["48a62778-7c11-486f-a0e1-020c283a7ef9", 9], // Nazgûl
    ["0e488c6c-aae2-450f-b969-7bb5a1b37a66", Number.POSITIVE_INFINITY], // Persistent Petitioners
    ["ec77d23b-0165-450d-9aae-73b755163753", Number.POSITIVE_INFINITY], // Rat Colony
    ["104ea189-14cd-420f-afdc-57b0f827ab8e", Number.POSITIVE_INFINITY], // Relentless Rats
    ["526ca4a9-3f50-4f7a-8169-2bda95792401", 7], // Seven Dwarves
    ["595a15f0-77f3-4544-8acc-10630e12cc14", Number.POSITIVE_INFINITY], // Shadowborn Apostle
    ["b53597f4-1a0f-4fa8-9c17-29178cdc4d2b", Number.POSITIVE_INFINITY], // Slime Against Humanity
    ["7423b3b9-56eb-4cf2-8ada-135918219c4b", Number.POSITIVE_INFINITY], // Tempest Hawk
    ["f9453fe2-fadf-4cd4-8d2c-0eaa0e2d78d6", Number.POSITIVE_INFINITY], // Templar Knight
]);

/** What is wrong with one slot */
export type SlotViolation =
    /** The catalog does not list the card as legal in this format */
    | { kind: "not-legal" }
    /**
     * More copies than allowed, counted over every printing of the card.
     * `allowed` is the limit that actually applies: the format's, unless the
     * card's own rules text raises it.
     */
    | { kind: "too-many"; copies: number; allowed: number }
    /** A colour the deck may not play */
    | { kind: "color-identity"; colors: string }
    /** A legal card that may not be this deck's commander */
    | { kind: "banned-as-commander" }
    /** A legal commander that may not be one of a partnered pair */
    | { kind: "banned-as-partner" }
    /** A legal card that may not be this deck's companion */
    | { kind: "banned-as-companion" };

/**
 * The deviations from a format's rules a playgroup agreed to.
 *
 * The generated names are read here and nowhere else, so a regenerated client
 * moves one file. `deckSize` counts the command zone, the way the format's own
 * size does.
 */
export type RuleZero = {
    /** Whether the table agreed to more commanders than the format allows */
    extraCommanders: boolean;
    /** Whether the table agreed to more copies of a card than the format allows */
    duplicates: boolean;
    /** Whether the table agreed to cards the format bans */
    banned: boolean;
    /** How many cards the deck is built to, `null` for the format's number */
    deckSize: number | null;
};

/**
 * What a deck's owner wrote down about the table's agreement
 *
 * @param deck the deck
 *
 * @returns its house rules
 */
export function deckRuleZero(deck: DeckResponse): RuleZero {
    return {
        extraCommanders: deck.allow_extra_commanders,
        duplicates: deck.allow_duplicates,
        banned: deck.allow_banned,
        deckSize: deck.deck_size ?? null,
    };
}

/**
 * How many deviations a deck records.
 *
 * The colour override is one of them: it predates the rest and keeps its own
 * endpoint, but the table agreed to it the same way.
 *
 * @param deck the deck
 *
 * @returns the count, `0` for a deck played by the book
 */
export function ruleZeroCount(deck: DeckResponse): number {
    const ruleZero = deckRuleZero(deck);
    const set = [
        deck.allowed_color_identity != null,
        ruleZero.extraCommanders,
        ruleZero.duplicates,
        ruleZero.banned,
        ruleZero.deckSize != null,
    ];
    return set.filter(Boolean).length;
}

/**
 * Whether a deck records any deviation at all
 *
 * @param deck the deck
 *
 * @returns whether the table agreed to anything
 */
export function hasRuleZero(deck: DeckResponse): boolean {
    return ruleZeroCount(deck) > 0;
}

/**
 * The Rule 0 dialog's form, as the reader left it.
 *
 * The size is held as the string the field carries rather than as a number: an
 * empty field is the format's own rule, and a number cannot say "empty".
 */
export type RuleZeroForm = {
    /** Whether the commander still decides which colours the deck may play */
    follow: boolean;
    /** The colours claimed while it does not */
    colors: Array<string>;
    /** Whether the table agreed to more commanders than the format allows */
    extraCommanders: boolean;
    /** Whether the table agreed to more copies of a card than the format allows */
    duplicates: boolean;
    /** Whether the table agreed to cards the format bans */
    banned: boolean;
    /** What the size field holds, empty for the format's number */
    deckSize: string;
};

/**
 * The writes one save owes the service.
 *
 * The colours keep their own endpoint, so a form that only moved a switch must
 * not rewrite them and a form that only moved a colour must not rewrite the
 * switches. An absent half is a request that is not worth making.
 */
export type RuleZeroSave = {
    /** The identity to store, `null` to hand the decision back to the commander */
    colors?: string | null;
    /** The four flags to store */
    rules?: SetDeckRuleZeroRequest;
};

/**
 * What a Rule 0 form changed, as the requests it takes to write it.
 *
 * An untouched form asks for nothing: the dialog is opened far more often than
 * it is edited, and a save that rewrites both halves either way would make the
 * deck look changed to every other tab watching it.
 *
 * @param deck the deck as it stands
 * @param form the form as the reader left it
 *
 * @returns the halves that actually moved
 */
export function ruleZeroSave(deck: DeckResponse, form: RuleZeroForm): RuleZeroSave {
    const save: RuleZeroSave = {};

    // Following the commander is the one thing an empty claim cannot say — a
    // deck may well claim no colours at all — so the switch says it instead.
    const colors = form.follow ? null : letters(form.colors.join("")).join("");
    if (colors !== (deck.allowed_color_identity ?? null)) save.colors = colors;

    // Anything that is not a whole number of cards is the format's rule: the
    // field is emptied far more often than it is filled with nonsense, and both
    // mean the same thing.
    const typed = Number.parseInt(form.deckSize, 10);
    const deckSize = Number.isInteger(typed) && typed >= 1 ? typed : null;
    const now = deckRuleZero(deck);
    if (
        form.extraCommanders !== now.extraCommanders ||
        form.duplicates !== now.duplicates ||
        form.banned !== now.banned ||
        deckSize !== now.deckSize
    ) {
        save.rules = {
            allow_extra_commanders: form.extraCommanders,
            allow_duplicates: form.duplicates,
            allow_banned: form.banned,
            deck_size: deckSize,
        };
    }

    return save;
}

/**
 * One agreed deviation, and what it is currently covering.
 *
 * A house rule is only stated once it does something: the section says what is
 * in effect, not what the deck would be permitted. `colors` and `deck-size`
 * are themselves the deviation, so they are stated whenever they are set.
 */
export type HouseRule =
    /** The deck claims its own colour identity */
    | { kind: "colors"; colors: string }
    /** More commanders than the format seats */
    | { kind: "commanders"; have: number }
    /** Cards played beyond the format's copy limit */
    | { kind: "duplicates"; cards: Array<string> }
    /** Cards the format does not list as legal */
    | { kind: "banned"; cards: Array<string> }
    /** A deck size other than the format's */
    | { kind: "deck-size"; want: number };

/** What is wrong with the deck as a whole */
export type DeckViolation =
    /** More Game Changers than the claimed bracket allows */
    | { kind: "game-changers"; have: number; allowed: number }
    /** Mass land denial in a bracket that plays none */
    | { kind: "mass-land-denial"; cards: Array<string> }
    /** Extra-turn spells the claimed bracket does not seat */
    | { kind: "extra-turns"; cards: Array<string>; chains: boolean }
    /** Complete combos the claimed bracket does not seat */
    | { kind: "combos"; combos: Array<Array<string>> }
    /** Two commanders the format does not let sit together */
    | { kind: "banned-pairing"; cards: Array<string> }
    /** Too few or too many cards */
    | { kind: "deck-size"; have: number; want: number; exact: boolean }
    /** No commander, or too many */
    | { kind: "commander-count"; have: number; min: number; max: number }
    /** More cards in the sideboard than allowed */
    | { kind: "sideboard-size"; have: number; allowed: number };

/**
 * What the four bracket rules are read against.
 *
 * Split out of {@link DeckLegality} because {@link checkBracket} needs nothing
 * else: a caller that has counted a deck can ask what any bracket makes of it
 * without carrying the format's remarks along.
 */
export type BracketCounts = {
    /** The Game Changers the deck plays, by name */
    gameChangers: Array<string>;
    /** The mass land denial the deck plays, by name */
    massLandDenial: Array<string>;
    /** The extra-turn spells the deck plays, by name */
    extraTurns: Array<string>;
    /**
     * Whether the deck can take extra turns back to back.
     *
     * The rule brackets 2 and 3 publish is about chaining, not about the card:
     * a lone Time Warp is a Core card. Two of them are not, because the second
     * is cast on the turn the first gave you — so the read is "more than one
     * extra-turn card", which is a fact about the deck rather than about any
     * printing in it.
     *
     * It errs toward silence, as the catalog flags themselves do: one card
     * that recurs itself — Nexus of Fate shuffling back in — chains on its own
     * and is not caught here, because whether a card brings itself back is a
     * property of its rules text, which no slot carries.
     */
    chainsExtraTurns: boolean;
    /**
     * The complete combos the deck holds, each as its card names.
     *
     * The one bracket rule the catalog cannot answer — it comes from the graph
     * advisor, arrives late and may not arrive at all. `null` means the
     * question is unanswered, which is a different thing from "none found":
     * a rule read against missing data would call every deck clean.
     *
     * Every length is here, not only the two-card ones: bracket 1 plays no
     * intentional infinite combo at all, so a three-card line is exactly what
     * moves a deck off it, while brackets 2 and 3 count only the pairs.
     */
    combos: Array<Array<string>> | null;
};

/** Everything the legality band draws */
export type DeckLegality = BracketCounts & {
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
    /** The agreed deviations that are actually in effect */
    houseRules: Array<HouseRule>;
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
 * Which job a slot is not allowed to do.
 *
 * The catalog answers whether a card may be in the deck at all; this answers
 * whether it may be in the zone it sits in, which is a different question and
 * one no printing row carries. Only a format that publishes such bans has any,
 * so for everything else every list is empty and this says nothing.
 *
 * @param slot the slot
 * @param bans what the format bans from a zone
 * @param commanders how many cards the command zone holds
 *
 * @returns the remark, or `undefined` when the slot may do its job
 */
function roleViolation(slot: DeckCardResponse, bans: RoleBansResponse, commanders: number): SlotViolation | undefined {
    const name = slot.card?.name;
    if (name == null) return undefined;

    if (slot.zone === "Companion") {
        return bans.companion.includes(name) ? { kind: "banned-as-companion" } : undefined;
    }
    if (slot.zone !== "Commander") return undefined;

    if (bans.commander.includes(name)) return { kind: "banned-as-commander" };
    // A partner ban is about the pair and not about the seat: alone the same
    // card is a legal commander, so a deck with one is asked nothing here.
    if (commanders > 1 && bans.partner.includes(name)) return { kind: "banned-as-partner" };
    return undefined;
}

/**
 * Check a deck against its format
 *
 * @param deck the deck
 * @param cards its slots
 * @param rules what the format asks, `undefined` for a format without rules
 * @param bracket what the claimed Commander bracket asks, `undefined` when none is claimed
 * @param combos the complete two-card combos the graph found, `null` while unanswered
 *
 * @returns the remarks
 */
export function checkDeck(
    deck: DeckResponse,
    cards: Array<DeckCardResponse>,
    rules: FormatRulesResponse | undefined,
    bracket?: BracketRulesResponse,
    combos: Array<Array<string>> | null = null,
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
    const extraTurns = named("extra_turns");
    const counts: BracketCounts = {
        gameChangers,
        massLandDenial: named("mass_land_denial"),
        extraTurns,
        // Two extra-turn cards are the whole read: the second is cast on the
        // turn the first handed over. What this misses on purpose is written
        // down on {@link BracketCounts.chainsExtraTurns}.
        chainsExtraTurns: extraTurns.length > 1,
        combos,
    };
    const overruled = deck.allowed_color_identity != null;
    const allowedColors = overruled ? letters(deck.allowed_color_identity ?? "") : commanderColors(commanders);
    const ruleZero = deckRuleZero(deck);

    const slots = new Map<string, Array<SlotViolation>>();
    // Read in one place — {@link checkBracket} — and turned into remarks here,
    // so the band and the bracket menu can never disagree about what the deck
    // plays. Detection errs toward silence, so an absent warning means
    // "nothing detected", never "nothing there".
    const deckViolations: Array<DeckViolation> = bracketViolations(counts, bracket);

    if (rules === undefined) {
        return {
            deck: deckViolations,
            slots,
            allowedColors,
            colorsOverruled: overruled,
            cards: cardCount,
            ...counts,
            // A format without rules asks nothing, so an agreement waives
            // nothing and there is nothing in effect to report.
            houseRules: [],
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

    // The slots an agreement waives, kept as slots so the same oracle-id dedupe
    // that names Game Changers can name these.
    const agreedBanned: Array<DeckCardResponse> = [];
    const agreedCopies: Array<DeckCardResponse> = [];

    // Read before the slots, because a partner ban is a fact about the command
    // zone rather than about the card: alone the card is a legal commander.
    const inCommandZone = commanders.reduce((sum, card) => sum + card.quantity, 0);

    for (const slot of cards) {
        if (slot.zone === "Maybe") continue;
        const card = slot.card;
        if (card == null) continue;

        const remarks: Array<SlotViolation> = [];

        // `legal_formats` is the only ban signal the catalog carries, so this
        // is where an agreement to play banned cards has to land.
        if (!card.legal_formats.includes(deck.format)) {
            if (ruleZero.banned) agreedBanned.push(slot);
            else remarks.push({ kind: "not-legal" });
        }

        // The bans the catalog cannot carry: these cards are legal in the
        // ninety-nine and illegal in the job the slot gives them, so the zone
        // is half of the question and a printing row knows nothing about it.
        const role = roleViolation(slot, rules.role_bans, inCommandZone);
        if (role !== undefined) {
            if (ruleZero.banned) agreedBanned.push(slot);
            else remarks.push(role);
        }

        // A card that says a deck may hold more of it than the format does
        // sets its own ceiling; everything else takes the format's. Twenty
        // Relentless Rats is a legal Commander deck, not twenty warnings.
        const limit = Math.max(rules.max_copies, NAMED_COPY_EXCEPTIONS.get(card.oracle_id ?? "") ?? 0);
        const copies = card.oracle_id == null ? 0 : (copiesPerOracle.get(card.oracle_id) ?? 0);
        if (copies > limit) {
            // Read against the ceiling that actually applies, so the list holds
            // exactly what the toggle waived. A card whose own text covers the
            // count is legal, not agreed, and never gets this far.
            if (ruleZero.duplicates) agreedCopies.push(slot);
            else remarks.push({ kind: "too-many", copies, allowed: limit });
        }

        if (rules.color_identity_locked && slot.zone !== "Commander" && allowedColors.length > 0) {
            const outside = letters(card.color_identity).filter((color) => !allowedColors.includes(color));
            if (outside.length > 0) {
                remarks.push({ kind: "color-identity", colors: outside.join("") });
            }
        }

        if (remarks.length > 0) slots.set(slot.uuid, remarks);
    }

    // A banned pairing names two cards and faults neither: it is the command
    // zone as a whole that breaks the rule, so it is read once, here, rather
    // than per slot. The same agreement covers it, and covering it means
    // naming the two commanders it seated.
    const seated = new Set(commanders.map((slot) => slot.card?.name).filter((name) => name != null));
    for (const pairing of rules.role_bans.pairings) {
        if (!pairing.every((name) => seated.has(name))) continue;
        if (ruleZero.banned) {
            agreedBanned.push(...commanders.filter((slot) => pairing.includes(slot.card?.name ?? "")));
        } else {
            deckViolations.push({ kind: "banned-pairing", cards: pairing });
        }
    }

    // An agreed size replaces the format's number and nothing else: a format
    // that asks for exactly so many cards still asks for exactly so many.
    const wanted = ruleZero.deckSize ?? rules.deck_size.cards;
    const exact = rules.deck_size.kind === "exactly";
    if (exact ? cardCount !== wanted : cardCount < wanted) {
        deckViolations.push({ kind: "deck-size", have: cardCount, want: wanted, exact });
    }

    // How many commanders the agreement is currently seating, `null` when it
    // seats none beyond the format's.
    let agreedCommanders: number | null = null;
    if (rules.commander.kind === "required") {
        // The agreement lifts the ceiling and only the ceiling — an empty
        // command zone is still a deck that cannot be started.
        const max = ruleZero.extraCommanders ? Number.POSITIVE_INFINITY : rules.commander.max;
        if (inCommandZone < rules.commander.min || inCommandZone > max) {
            deckViolations.push({
                kind: "commander-count",
                have: inCommandZone,
                min: rules.commander.min,
                max: rules.commander.max,
            });
        }
        if (ruleZero.extraCommanders && inCommandZone > rules.commander.max) {
            agreedCommanders = inCommandZone;
        }
    }

    // Zero really means no sideboard. Commander used to treat this zone as a
    // maybeboard, but that made a rule-defined absence behave like permission.
    const inSideboard = sideboard.reduce((sum, card) => sum + card.quantity, 0);
    if (inSideboard > rules.sideboard) {
        deckViolations.push({ kind: "sideboard-size", have: inSideboard, allowed: rules.sideboard });
    }

    // Stated in the order the union declares them, and only where they are
    // doing something: a toggle that covers nothing is a permission, not a
    // house rule in effect. The two that are the deviation — the claimed
    // colours and the claimed size — are stated whenever they are set.
    const houseRules: Array<HouseRule> = [];
    if (overruled) houseRules.push({ kind: "colors", colors: allowedColors.join("") });
    if (agreedCommanders !== null) houseRules.push({ kind: "commanders", have: agreedCommanders });
    if (agreedCopies.length > 0) houseRules.push({ kind: "duplicates", cards: uniqueNames(agreedCopies) });
    if (agreedBanned.length > 0) houseRules.push({ kind: "banned", cards: uniqueNames(agreedBanned) });
    if (ruleZero.deckSize !== null) houseRules.push({ kind: "deck-size", want: ruleZero.deckSize });

    return {
        deck: deckViolations,
        slots,
        allowedColors,
        colorsOverruled: overruled,
        cards: cardCount,
        ...counts,
        houseRules,
    };
}

/**
 * The house rules a deck is playing under, without the rest of the count.
 *
 * The legality dropdown and the advisor's banner say the same thing, so they
 * read it from the same place.
 *
 * @param deck the deck
 * @param cards its slots
 * @param rules what the format asks, `undefined` for a format without rules
 *
 * @returns one entry per deviation in effect
 */
export function houseRulesSummary(
    deck: DeckResponse,
    cards: Array<DeckCardResponse>,
    rules: FormatRulesResponse | undefined,
): Array<HouseRule> {
    return checkDeck(deck, cards, rules).houseRules;
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

/**
 * The rules a claimed bracket reads out, in the order they are drawn.
 *
 * The one list every consumer derives from: the check rows' `kind`, and the
 * question of which deck violations belong to the bracket section rather
 * than the format's. A new bracket rule lands here and the type system
 * carries it to the rest.
 */
export const BRACKET_RULE_KINDS = ["game-changers", "mass-land-denial", "extra-turns", "combos"] as const;

/** One of a bracket's rules, read against the deck */
export type BracketRuleCheck = {
    /** Which rule this is */
    kind: (typeof BRACKET_RULE_KINDS)[number];
    /** Whether the deck keeps to it */
    kept: boolean;
    /** How many of the things the rule counts are in the deck */
    have: number;
    /** How many it may play, `null` when the bracket sets no limit */
    allowed: number | null;
    /** The things behind the count, by name — for combos, each entry is one combo */
    cards: Array<string>;
    /**
     * The card names a click on the rule filters the deck down to.
     *
     * Usually the same as `cards`; the combo rule differs — it counts combos,
     * but the deck view holds cards, so the filter names the pieces.
     */
    names: Array<string>;
    /**
     * Which of the three steps the bracket set for this rule.
     *
     * `"none"` plays none of the thing at all, `"limited"` tolerates it up to
     * a point the other fields spell out, `"any"` sets no limit. Only the step
     * tells "one extra turn, which Core seats" apart from "no extra turns,
     * which is why it is seated" — both are kept, and they do not read the
     * same.
     */
    step: "none" | "limited" | "any";
    /** How many of `have` the rule actually forbids — `0` whenever it is kept */
    breaking: number;
};

/**
 * Whether a remark is the bracket's business rather than the format's
 *
 * @param violation the remark
 *
 * @returns whether the bracket menu already draws it
 */
export function isBracketViolation(violation: DeckViolation): boolean {
    return (BRACKET_RULE_KINDS as readonly string[]).includes(violation.kind);
}

/**
 * What the five brackets ask, for a rule the service did not name.
 *
 * Wizards' brackets are a published constant — the same five rungs for
 * everyone, changing only when Wizards changes them — so a client that cannot
 * say what a deck plays as is strictly worse than one that knows the ladder by
 * heart. The served rules still win whenever they say something this
 * understands; these are what a rule falls back to when it does not, which in
 * practice means a service one release behind the two rules that grew from a
 * yes/no into three steps.
 *
 * Keyed on the bracket number rather than the slug: the number is what the
 * whole ladder is ordered by, and a renamed rung is still the same rung.
 */
const EXTRA_TURN_LADDER: Readonly<Record<number, ExtraTurnRule>> = {
    1: "none",
    2: "no-chaining",
    3: "no-chaining",
    4: "any",
    5: "any",
};

/** What the five brackets ask of combos, read like {@link EXTRA_TURN_LADDER} */
const COMBO_LADDER: Readonly<Record<number, ComboRule>> = {
    1: "none",
    2: "no-two-card",
    3: "any",
    4: "any",
    5: "any",
};

/**
 * How much extra-turn play a bracket tolerates
 *
 * @param rules the bracket, as the service states it
 *
 * @returns the served rule, or the ladder's own when that is not one of the
 *   three steps — never a restriction this invented, so an unknown rung reads
 *   as no limit rather than as a fault
 */
function extraTurnRule(rules: BracketRulesResponse): ExtraTurnRule {
    const served: unknown = rules.extra_turns;
    if (served === "none" || served === "no-chaining" || served === "any") return served;
    return EXTRA_TURN_LADDER[rules.number] ?? "any";
}

/**
 * How much combo play a bracket tolerates, read like {@link extraTurnRule}
 *
 * @param rules the bracket, as the service states it
 *
 * @returns the served rule, or the ladder's own
 */
function comboRule(rules: BracketRulesResponse): ComboRule {
    const served: unknown = rules.combos;
    if (served === "none" || served === "no-two-card" || served === "any") return served;
    return COMBO_LADDER[rules.number] ?? "any";
}

/**
 * Read one bracket's rules against a deck that has already been counted.
 *
 * Every rule comes back, kept or broken: a menu that only lists what is wrong
 * cannot say a deck is inside its bracket, which is the more common answer and
 * the one worth showing. The one exception is the combo rule while its answer
 * is missing — an absent row says "not checked", where a kept row would say
 * "checked and clean", and only one of those is true.
 *
 * Two of the four rules climb in three steps rather than two, because the
 * published rules do: a bracket may seat extra turns that cannot be chained,
 * and combos that are not two cards. So each rule says what it forbids *and*
 * how much of what the deck holds is that thing — `have` counts the cards,
 * `breaking` counts the ones the rule is actually about.
 *
 * @param counts what {@link checkDeck} counted
 * @param rules what the bracket asks
 *
 * @returns one entry per rule, in the order they are drawn
 */
export function checkBracket(counts: BracketCounts, rules: BracketRulesResponse): Array<BracketRuleCheck> {
    /**
     * One rule, against the things the deck holds for it
     *
     * @param kind which rule
     * @param cards the things, by name
     * @param step what the bracket set for this rule
     * @param breaking how many of `cards` the rule forbids
     * @param allowed how many are tolerated, `null` for no limit
     * @param names the card names a click filters to, when not `cards` itself
     *
     * @returns the check
     */
    const read = (
        kind: BracketRuleCheck["kind"],
        cards: Array<string>,
        step: BracketRuleCheck["step"],
        breaking: number,
        allowed: number | null,
        names: Array<string> = cards,
    ): BracketRuleCheck => ({
        kind,
        kept: breaking === 0,
        have: cards.length,
        allowed,
        cards,
        names,
        step,
        breaking,
    });

    const maxGameChangers = rules.max_game_changers ?? null;
    const extraTurns = extraTurnRule(rules);
    const combos = comboRule(rules);
    const twoCard = counts.combos?.filter((combo) => combo.length === 2) ?? [];

    return [
        read(
            "game-changers",
            counts.gameChangers,
            maxGameChangers === null ? "any" : maxGameChangers === 0 ? "none" : "limited",
            maxGameChangers === null ? 0 : Math.max(0, counts.gameChangers.length - maxGameChangers),
            maxGameChangers,
        ),
        // The one rule that stayed a yes or no: a bracket either plays mass
        // land denial or it does not, so it reads as "none" or as no limit at
        // all — never as a count.
        read(
            "mass-land-denial",
            counts.massLandDenial,
            rules.mass_land_denial ? "any" : "none",
            rules.mass_land_denial ? 0 : counts.massLandDenial.length,
            rules.mass_land_denial ? null : 0,
        ),
        // A bracket that asks only that turns are not chained seats the cards
        // themselves, so nothing breaks until the deck can take two in a row —
        // and then every one of them is part of the chain.
        read(
            "extra-turns",
            counts.extraTurns,
            extraTurns === "any" ? "any" : extraTurns === "none" ? "none" : "limited",
            extraTurns === "any"
                ? 0
                : extraTurns === "none"
                  ? counts.extraTurns.length
                  : counts.chainsExtraTurns
                    ? counts.extraTurns.length
                    : 0,
            extraTurns === "any" ? null : extraTurns === "none" ? 0 : null,
        ),
        // Each combo reads as one entry, its pieces joined: the rule counts
        // combos, not cards, and which pieces belong together is the answer.
        // The filterable names are the pieces themselves, deduped — a card
        // can sit in two combos and the deck view holds it once.
        ...(counts.combos === null
            ? []
            : [
                  read(
                      "combos",
                      counts.combos.map((combo) => combo.join(" + ")),
                      combos === "any" ? "any" : combos === "none" ? "none" : "limited",
                      combos === "any" ? 0 : combos === "none" ? counts.combos.length : twoCard.length,
                      combos === "any" ? null : 0,
                      [...new Set(counts.combos.flat())],
                  ),
              ]),
    ];
}

/**
 * The remarks a claimed bracket's broken rules make.
 *
 * The legality band counts remarks and the bracket menu reads out rules; both
 * come from {@link checkBracket}, so the two can never disagree about what the
 * deck plays.
 *
 * @param counts what {@link checkDeck} counted
 * @param bracket what the claimed bracket asks, `undefined` when none is claimed
 *
 * @returns one remark per broken rule
 */
function bracketViolations(counts: BracketCounts, bracket: BracketRulesResponse | undefined): Array<DeckViolation> {
    if (bracket === undefined) return [];

    return checkBracket(counts, bracket).flatMap<DeckViolation>((check) => {
        if (check.kept) return [];
        switch (check.kind) {
            case "game-changers":
                return [{ kind: "game-changers", have: check.have, allowed: check.allowed ?? 0 }];
            case "mass-land-denial":
                return [{ kind: "mass-land-denial", cards: check.cards }];
            case "extra-turns":
                return [{ kind: "extra-turns", cards: check.cards, chains: counts.chainsExtraTurns }];
            case "combos":
                return [{ kind: "combos", combos: counts.combos ?? [] }];
        }
    });
}

/**
 * The lowest bracket whose rules the deck actually keeps.
 *
 * What the deck plays as, against what it claims. Read from everything that
 * has an answer: the catalog's flags always, and the graph's combo detection
 * once it has spoken — until then a deck that plays a two-card combo sits a
 * bracket higher than this says, and the menu says so instead of guessing.
 *
 * @param counts what {@link checkDeck} counted
 * @param brackets the brackets on offer
 *
 * @returns the bracket number, or `null` for a format without brackets
 */
export function playedBracket(counts: BracketCounts, brackets: Array<BracketRulesResponse>): number | null {
    const climbing = [...brackets].sort((left, right) => left.number - right.number);
    const fits = climbing.find((rules) => checkBracket(counts, rules).every((check) => check.kept));
    return fits?.number ?? null;
}

/**
 * The lowest bracket a deck can be *claimed* at without anyone reading it.
 *
 * {@link playedBracket} answers what the cards keep to; this answers what may
 * be written down on the deck's behalf, and the two differ at both ends of the
 * ladder. Exhibition and cEDH are statements of intent — a themed pile and a
 * tournament deck — and no list of cards proves either one, so a deck that
 * breaks nothing is claimed at Core rather than at Exhibition, and one that
 * breaks everything is claimed at Optimized rather than at cEDH. Both remain a
 * person's to claim by hand.
 *
 * @param counts what {@link checkDeck} counted
 * @param brackets the brackets on offer
 *
 * @returns the bracket number, or `null` for a format without brackets
 */
export function detectedBracket(counts: BracketCounts, brackets: Array<BracketRulesResponse>): number | null {
    const plays = playedBracket(counts, brackets);
    if (plays === null) return null;

    // Clamped against the offered ladder rather than against 2 and 4 outright,
    // so a format that publishes some other set of brackets is not squeezed
    // into rungs it does not have.
    const numbers = brackets.map((rules) => rules.number).sort((left, right) => left - right);
    const floor = numbers[1] ?? numbers[0] ?? plays;
    const ceiling = numbers[numbers.length - 2] ?? numbers[numbers.length - 1] ?? plays;
    return Math.min(Math.max(plays, floor), ceiling);
}
