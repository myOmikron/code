/** The card data an effective mana value is read from */
export type CostedCard = {
    /** The complete type line */
    type_line: string;
    /** What the printed cost adds up to */
    mana_value: number;
};

/** A standing discount an eminence grants from the command zone */
type EminenceDiscount = {
    /** The creature type whose spells cost less */
    type: string;
    /** By how much */
    less: number;
};

/** The commanders whose eminence discounts spells — one exists in all of Magic */
const EMINENCE_DISCOUNTS: Record<string, EminenceDiscount> = {
    "The Ur-Dragon": { type: "Dragon", less: 1 },
};

/**
 * Mana values as the deck pays them, not as the cards are printed.
 *
 * An eminence that discounts spells works from the command zone, before the
 * commander is ever cast, so its deck pays the reduced cost in every game —
 * a curve bucketed by printed cost describes a deck nobody plays. Reducers
 * that must reach the battlefield first stay printed: they are a game state,
 * not a property of the deck.
 *
 * @param cards the deck's slots, the command zone among them
 *
 * @returns a card's mana value as cast, and whether a discount is in force
 */
export function effectiveManaValue(cards: Array<{ zone: string; card?: { name: string } | null }>): {
    /** A card's mana value with the standing discount counted in */
    of: (card: CostedCard) => number;
    /** Whether the deck's commander grants such a discount */
    eminence: boolean;
} {
    const discount = cards
        .filter((slot) => slot.zone === "Commander")
        .map((slot) => EMINENCE_DISCOUNTS[slot.card?.name ?? ""])
        .find((found) => found !== undefined);

    if (discount === undefined) return { of: (card) => card.mana_value, eminence: false };
    return {
        of: (card) =>
            card.type_line.includes(discount.type) ? Math.max(0, card.mana_value - discount.less) : card.mana_value,
        eminence: true,
    };
}

/** The card data needed to decide whether it may lead a Commander deck. */
export type CommanderCandidate = {
    /** The complete type line, including both faces where applicable. */
    typeLine: string;
    /** The complete Oracle text, including both faces where applicable. */
    oracleText: string;
};

/**
 * Whether a card is allowed in the command zone.
 *
 * Legendary creatures are the normal case. Legendary Backgrounds can be a
 * second commander, and the remaining exceptions state the permission in
 * their Oracle text (planeswalkers and cards such as Shorikai among them).
 *
 * @param card the card being considered
 *
 * @returns whether the card may lead the deck
 */
export function canBeCommander(card: CommanderCandidate): boolean {
    const type = card.typeLine.toLocaleLowerCase();
    const ordinary = type.includes("legendary") && (type.includes("creature") || type.includes("background"));
    return ordinary || /can be your commander/i.test(card.oracleText);
}
