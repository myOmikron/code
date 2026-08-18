/**
 * A deck as the plain text every other builder reads.
 *
 * The format is the one MTGO wrote, Arena kept and Moxfield, Archidekt and
 * TappedOut all import: one line per slot, `2 Sol Ring (LTR) 297`, under a
 * heading per zone, with `*F*` on the foils. It is also what `decklist.ts`
 * reads, so a deck exported here comes back in whole.
 */

import type { DeckCardResponse, DeckZone } from "src/api/generated";
import { finishOf } from "src/utils/deck-foil";

/** The zones in the order a decklist is written, with the heading each gets */
const SECTIONS: Array<{ zone: DeckZone; heading: string }> = [
    { zone: "Commander", heading: "Commander" },
    { zone: "Main", heading: "Deck" },
    { zone: "Companion", heading: "Companion" },
    { zone: "Side", heading: "Sideboard" },
    { zone: "Maybe", heading: "Maybeboard" },
];

/**
 * Write a deck as a decklist
 *
 * @param cards the deck's slots
 *
 * @returns the list, with a blank line between the sections
 */
export function exportDecklist(cards: Array<DeckCardResponse>): string {
    const sections: Array<string> = [];

    for (const section of SECTIONS) {
        const lines = cards
            .filter((card) => card.zone === section.zone && card.card != null)
            .map((card) => line(card))
            .sort((left, right) => left.localeCompare(right));
        if (lines.length === 0) continue;
        sections.push([section.heading, ...lines].join("\n"));
    }

    return sections.join("\n\n");
}

/**
 * One slot as one line
 *
 * The print is named because a deck is sleeved from actual cards; a builder
 * that does not care about the print ignores the brackets.
 *
 * @param card the slot
 *
 * @returns the line
 */
function line(card: DeckCardResponse): string {
    const printing = card.card;
    if (printing == null) return "";

    const parts = [`${card.quantity}`, printing.name, `(${printing.set_code})`, printing.collector_number];
    const finish = finishOf(card);
    if (finish === "Foil") parts.push("*F*");
    if (finish === "Etched") parts.push("*E*");

    return parts.join(" ");
}
