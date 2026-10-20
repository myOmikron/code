import { useEffect } from "react";

/**
 * How big each deck was when this tab last looked, and whether it still owes
 * a claim. Kept beside the pages rather than in them, so a deck filled on the
 * advisor is still claimed once the cards tab can read it.
 */
const lastSeen = new Map<string, { cards: number; due: boolean }>();

/**
 * Claims a bracket for a deck that claims none, on the step that makes it full.
 *
 * Only the step counts: a deck that is already full when it is opened, or whose
 * claim its owner cleared, is left alone. The step is remembered until the
 * cards can be read, since the combo answer arrives after them.
 *
 * @param deck the deck's uuid
 * @param claimed the bracket the deck claims, `null` for none
 * @param cards how many cards the deck holds, commanders included
 * @param target the deck's full size, `null` for a format without one
 * @param detected what the cards read as, `null` until that can be said
 * @param claim writes the claim
 */
export function useBracketClaim(
    deck: string,
    claimed: number | null,
    cards: number,
    target: number | null,
    detected: number | null,
    claim: (bracket: number) => void,
) {
    useEffect(() => {
        const last = lastSeen.get(deck);
        const full = target !== null && cards >= target;
        const stepped = last !== undefined && target !== null && last.cards < target && full;
        const due = full && claimed === null && (stepped || last?.due === true);
        lastSeen.set(deck, { cards, due: due && detected === null });
        if (due && detected !== null) claim(detected);
    }, [deck, claimed, cards, target, detected]);
}
