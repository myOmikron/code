//! Resolves the printings a staging area holds into cards that can be drawn.

import { useEffect, useState } from "react";
import type { ScannerSessionEntryResponse } from "src/api/generated";
import type { CardRecord } from "src/types";
import { knownCard, resolveCards } from "src/utils/session-cards";

/**
 * The cards behind a session's stacks, looked up once per printing.
 *
 * Keyed on the printings rather than on the rows: `entries` is a fresh array on every render, and
 * a hook that both depended on it and set state would re-run itself forever. What this is
 * actually about is which cards have to be looked up, and that changes far less often than the
 * rows do.
 *
 * @param entries the staged stacks on screen
 *
 * @returns the card per printing, missing while a lookup is still running
 */
export function useSessionCards(entries: readonly ScannerSessionEntryResponse[]): Record<string, CardRecord> {
    const [cards, setCards] = useState<Record<string, CardRecord>>({});
    const printings = entries.map((entry) => entry.printing).join(",");

    useEffect(() => {
        const wanted = printings === "" ? [] : printings.split(",");
        let dropped = false;
        void resolveCards(wanted).then(() => {
            if (dropped) return;
            const found: Record<string, CardRecord> = {};
            for (const printing of wanted) {
                const card = knownCard(printing);
                // A printing the catalogue does not know keeps its row and loses its name; the
                // count, the finish and the way to correct it are all still there.
                if (card) found[printing] = card;
            }
            setCards(found);
        });
        return () => {
            dropped = true;
        };
    }, [printings]);

    return cards;
}
