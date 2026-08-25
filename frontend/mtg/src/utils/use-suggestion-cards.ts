import { useQuery } from "@tanstack/react-query";
import { resolveLookups } from "src/utils/printing-catalog";
import { Printing, resolvePrintings } from "src/utils/scryfall";

/**
 * The answer when there is nothing to resolve. One stable reference, so an
 * empty result never reads as "a map that just changed" to a caller.
 */
const EMPTY_CARDS: Map<string, Printing> = new Map();

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
 * A failed lookup does not clear `cards` — see the type doc. TanStack Query
 * leaves the last successful map standing under `error` on its own; this only
 * has to read it. It does not report through the shared error store: the
 * lookup runs quietly on purpose, so a caller can show its own inline note
 * beside the list it belongs to, with its own `retry`, rather than a toast
 * that outlives the page that needed it.
 *
 * @param names the card names to resolve, in a stable order
 *
 * @returns what has been resolved so far, and the state of the resolve
 */
export function useSuggestionCards(names: Array<string>): SuggestionCards {
    const query = useQuery({
        queryKey: ["suggestion-cards", names.join("\n")],
        queryFn: async () => {
            const resolved = await resolveLookups(
                names.map((name) => ({ name })),
                undefined,
                true,
            );
            const ids = resolved.filter((printing) => printing !== null).map((printing) => printing.id);
            const printings = await resolvePrintings(ids);
            const byName = new Map<string, Printing>();
            names.forEach((name, index) => {
                const placed = resolved[index];
                if (placed === null) return;
                const printing = printings.get(placed.id);
                if (printing !== undefined) byName.set(name, printing);
            });
            return byName;
        },
        enabled: names.length > 0,
    });

    const retry = () => void query.refetch();

    if (names.length === 0) return { cards: EMPTY_CARDS, state: "ready", retry };
    if (query.status === "pending") return { cards: EMPTY_CARDS, state: "loading", retry };
    // Both "never resolved once" and "resolved before, this attempt failed"
    // land here — the map is best-effort either way, see the type doc.
    if (query.status === "error") return { cards: query.data ?? EMPTY_CARDS, state: "error", retry };
    return { cards: query.data, state: "ready", retry };
}
