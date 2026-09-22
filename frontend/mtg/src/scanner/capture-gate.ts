/**
 * Prevents detector dropouts and edition changes from counting the same held card twice.
 *
 * @returns the session's capture gate
 */
export function createCaptureGate() {
    let last: { id: string; name: string } | undefined;
    let missing = 0;
    return {
        /**
         * Only completed scans count as evidence that the card has left.
         *
         * @param present
         */
        observe(present: boolean) {
            missing = present ? 0 : missing + 1;
            if (missing >= 2) last = undefined;
        },
        /**
         * A different printing of the same held card is a correction, not another copy.
         *
         * @param card
         * @param card.id
         * @param card.name
         * @returns whether this is a new card to capture
         */
        accept(card: { id: string; name: string }): boolean {
            missing = 0;
            if (last && (last.id === card.id || last.name === card.name)) return false;
            last = { id: card.id, name: card.name };
            return true;
        },
        /**
         *
         */
        reset() {
            last = undefined;
            missing = 0;
        },
    };
}
