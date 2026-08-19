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
 */
export function canBeCommander(card: CommanderCandidate): boolean {
    const type = card.typeLine.toLocaleLowerCase();
    const ordinary = type.includes("legendary") && (type.includes("creature") || type.includes("background"));
    return ordinary || /can be your commander/i.test(card.oracleText);
}
