import { useCallback, useState } from "react";

/** Which cards of a list are showing their back, and how to turn one over */
export type FlippedCards = {
    /** Whether this card is showing its back */
    isFlipped: (key: string) => boolean;
    /** Turns this card over, leaving the rest of the list as it is */
    toggle: (key: string) => void;
};

/**
 * Remembers which cards of a list have been turned over.
 *
 * One set for the whole list rather than a state per tile: the tiles are drawn
 * in a loop, which is not a place a hook can be called from. The keys are
 * whatever the list already keys its rows by, so a card that scrolls out of the
 * page simply stops being asked about.
 *
 * Deliberately not persisted. A card turned over is a question being answered,
 * not a setting, and coming back to a binder page of backs would be a puzzle.
 *
 * @returns which cards are flipped, and how to flip one
 */
export function useFlippedCards(): FlippedCards {
    const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());

    const toggle = useCallback((key: string) => {
        setFlipped((current) => {
            const next = new Set(current);
            if (!next.delete(key)) next.add(key);
            return next;
        });
    }, []);

    const isFlipped = useCallback((key: string) => flipped.has(key), [flipped]);

    return { isFlipped, toggle };
}
