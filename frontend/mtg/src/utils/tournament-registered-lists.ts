/**
 * What an Organizer is warned about in a Registered deck.
 *
 * Only warnings: a table may have agreed to anything (Rule 0), so nothing here
 * keeps a Participant from playing. The deck's own agreement counts, the way
 * it does on the deck page, so an agreed banned card is no remark.
 */

import type { BracketRulesResponse, RegisteredListResponse, FormatRulesResponse } from "src/api/generated";
import { type BracketRuleCheck, checkBracket, checkDeck, countBracket } from "src/utils/deck-rules";

/** One thing about a Registered deck worth a word with its player */
export type RegisteredListWarning =
    /** The deck is built for another format than the Tournament's */
    | { kind: "format"; format: string }
    /** The format's rules find this many remarks, over the deck and its cards */
    | { kind: "legality"; remarks: number }
    /** The bracket the deck claims, and which of its rules the deck breaks */
    | { kind: "bracket"; bracket: number; rules: Array<BracketRuleCheck["kind"]> };

/**
 * Check a Registered deck against the Tournament it is played in
 *
 * @param list the Registered deck's list
 * @param tournamentFormat the Tournament's format, `null` when it names none
 * @param formats every format's rules
 * @param brackets the Commander brackets
 *
 * @returns the warnings, empty for a deck nobody needs to talk about
 */
export function registeredListWarnings(
    list: RegisteredListResponse,
    tournamentFormat: string | null | undefined,
    formats: Array<FormatRulesResponse>,
    brackets: Array<BracketRulesResponse>,
): Array<RegisteredListWarning> {
    const warnings: Array<RegisteredListWarning> = [];
    if (tournamentFormat != null && list.format !== tournamentFormat) {
        warnings.push({ kind: "format", format: list.format });
    }

    // The Tournament's format is the one played, whatever the deck claims.
    const format = tournamentFormat ?? list.format;
    const rules = formats.find((entry) => entry.slug === format);
    const legality = checkDeck({ ...list, format }, list.cards, rules);
    let remarks = legality.deck.length;
    for (const slot of legality.slots.values()) remarks += slot.length;
    if (remarks > 0) warnings.push({ kind: "legality", remarks });

    const claimed = brackets.find((entry) => entry.number === list.bracket);
    if (claimed !== undefined) {
        const broken = checkBracket(countBracket(list.cards), claimed)
            .filter((check) => !check.kept)
            .map((check) => check.kind);
        if (broken.length > 0) warnings.push({ kind: "bracket", bracket: claimed.number, rules: broken });
    }
    return warnings;
}
