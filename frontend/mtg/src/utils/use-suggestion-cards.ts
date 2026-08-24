import { useCallback, useEffect, useState } from "react";
import { resolveLookups } from "src/utils/printing-catalog";
import { Printing, resolvePrintings } from "src/utils/scryfall";

/**
 * What one suggestion-card lookup knows right now, following the state
 * vocabulary of {@link useGraphQuery} (`src/utils/use-graph-query.ts`).
 *
 * `cards` deliberately survives a failed lookup: a suggestion list is
 * mid-lookup or mid-retry far more often than it is broken, and replacing
 * every row's artwork and Add/Swap button with nothing on one network
 * hiccup is worse than leaving the last good answer on screen.
 */
export type SuggestionCards = {
    /** Resolved card data by name, for artwork and the printing an add files */
    cards: Map<string, Printing>;
    /** Waiting on an answer, holding one, or the last attempt failed */
    state: "loading" | "ready" | "error";
    /** Asks again from scratch, after a failure */
    retry: () => void;
};

/**
 * Resolves suggestion names to card data, for artwork, mana costs and the
 * printing an add would file.
 *
 * Two hops through existing machinery: the service's own catalog places each
 * name (the same call an import uses), then the printing store answers with
 * the card — memory, IndexedDB, then Scryfall. Names the catalog cannot place
 * are simply absent from the result; the row renders without artwork and
 * without an add button rather than not at all.
 *
 * A failed lookup does not clear `cards` — see the type doc — and does not
 * report through the shared error store: the lookup runs `quietly` on
 * purpose, so a caller can show its own inline note beside the list it
 * belongs to, with its own `retry`, rather than a toast that outlives the
 * page that needed it.
 *
 * @param names the card names to resolve, in a stable order
 *
 * @returns what has been resolved so far, and the state of the resolve
 */
export function useSuggestionCards(names: Array<string>): SuggestionCards {
    const [cards, setCards] = useState<Map<string, Printing>>(new Map());
    const [state, setState] = useState<"loading" | "ready" | "error">("ready");
    // Bumped by `retry`; included in the effect deps so a retry actually
    // re-runs the request even though the names themselves did not change.
    const [attempt, setAttempt] = useState(0);
    // The array is rebuilt per render; its content is the actual dependency.
    const key = names.join("\n");

    useEffect(() => {
        if (names.length === 0) {
            setCards(new Map());
            setState("ready");
            return;
        }
        let cancelled = false;
        setState("loading");
        void (async () => {
            try {
                const resolved = await resolveLookups(
                    names.map((name) => ({ name })),
                    undefined,
                    true,
                );
                const ids = resolved.filter((printing) => printing !== null).map((printing) => printing.id);
                const printings = await resolvePrintings(ids);
                if (cancelled) return;
                const byName = new Map<string, Printing>();
                names.forEach((name, index) => {
                    const placed = resolved[index];
                    if (placed === null) return;
                    const printing = printings.get(placed.id);
                    if (printing !== undefined) byName.set(name, printing);
                });
                setCards(byName);
                setState("ready");
            } catch {
                // The previous map is left standing — see the type doc.
                if (!cancelled) setState("error");
            }
        })();
        return () => {
            cancelled = true;
        };
        // Keyed on the joined names, plus the retry attempt.
    }, [key, attempt]);

    const retry = useCallback(() => setAttempt((count) => count + 1), []);

    return { cards, state, retry };
}
