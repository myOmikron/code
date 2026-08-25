/**
 * A deck as the plain text every other builder reads.
 *
 * The format is the one MTGO wrote, Arena kept and Moxfield, Archidekt and
 * TappedOut all import: one line per slot, `2 Sol Ring (LTR) 297`, under a
 * heading per zone, with `*F*` on the foils. It is also what `decklist.ts`
 * reads, so a deck exported here comes back in whole.
 *
 * The print can be left off, which is what somebody wants who is handing the
 * list to a player rather than to a binder: `2 Sol Ring` and nothing else, so
 * whoever reads it sleeves whatever they own.
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
 * @param withPrinting whether a line names the print the deck is sleeved from
 *
 * @returns the list, with a blank line between the sections
 */
export function exportDecklist(cards: Array<DeckCardResponse>, withPrinting: boolean = true): string {
    const sections: Array<string> = [];

    for (const section of SECTIONS) {
        const slots = cards.filter((card) => card.zone === section.zone && card.card != null);
        const lines = (withPrinting ? slots.map((card) => line(card)) : byName(slots)).sort((left, right) =>
            left.localeCompare(right),
        );
        if (lines.length === 0) continue;
        sections.push([section.heading, ...lines].join("\n"));
    }

    return sections.join("\n\n");
}

/**
 * The slots of one zone as lines naming only the card.
 *
 * Two slots of the same card in different prints are one line here, because
 * without the brackets they would otherwise read as two entries for the same
 * card. The finish goes with the print for the same reason: it is a fact about
 * the copies, and once those are no longer named there is nothing to hang it on.
 *
 * @param slots the zone's slots, each with a print the catalog knows
 *
 * @returns one line per card
 */
function byName(slots: Array<DeckCardResponse>): Array<string> {
    const copies = new Map<string, number>();

    for (const slot of slots) {
        const name = slot.card?.name;
        if (name === undefined) continue;
        copies.set(name, (copies.get(name) ?? 0) + slot.quantity);
    }

    return [...copies].map(([name, quantity]) => `${quantity} ${name}`);
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
