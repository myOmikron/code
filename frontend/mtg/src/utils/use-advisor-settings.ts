import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Api } from "src/api/api";
import { AdvisorSettings, DEFAULT_ADVISOR_SETTINGS, fromResponse, toRequest } from "src/utils/advisor-settings";

/**
 * What one deck's advisor settings query knows right now.
 */
export type AdvisorSettingsQuery = {
    /** What the server holds, or the defaults while the answer is out */
    settings: AdvisorSettings;
    /**
     * Whether `settings` is the server's real answer rather than a
     * placeholder standing in for it.
     *
     * The graph queries downstream of this (targets, themes, the pool) all
     * take their parameters from `settings` — firing one before the real
     * answer has arrived asks the graph against the defaults, then again a
     * moment later against the truth, which is one wasted request and a
     * flash of advice that was never right. Every graph query in the
     * advisor gates its `enabled` on this flag for exactly that reason.
     */
    ready: boolean;
    /** Replaces the document, optimistically */
    save: (next: AdvisorSettings) => void;
};

/**
 * One deck's advisor settings for the current reader: which themes it
 * argues for, the shape it grades against, what a card may cost, and the
 * two lists of cards it has been told to leave alone.
 *
 * Modelled on {@link useSuggestionCards} (`use-suggestion-cards.ts`): a thin
 * wrapper over `useQuery` so every caller reads the same three-part contract
 * instead of TanStack's own vocabulary. `save` writes the cache first, so
 * every panel that reads `settings` sees the edit immediately, then PUTs the
 * whole document — on failure the write is reported through the shared error
 * store the same way every other write in this app is (`handleError` in
 * `api.tsx`), and the cache is invalidated so the server's truth replaces
 * the optimistic guess rather than the two silently drifting apart.
 *
 * @param deckUuid the deck
 *
 * @returns the settings, whether they are the server's real answer, and a way to replace them
 */
export function useAdvisorSettings(deckUuid: string): AdvisorSettingsQuery {
    const queryClient = useQueryClient();
    const queryKey = ["advisor-settings", deckUuid];

    const query = useQuery({
        queryKey,
        queryFn: async () => fromResponse(await Api.decks.advisorSettings.get(deckUuid)),
    });

    /**
     * Replaces the settings document, optimistically
     *
     * @param next the whole document to write
     */
    function save(next: AdvisorSettings): void {
        queryClient.setQueryData<AdvisorSettings>(queryKey, next);
        Api.decks.advisorSettings.save(deckUuid, toRequest(next)).catch(() => {
            // Already reported by `handleError`; this only has to stop the
            // cache from lying about what the server actually holds.
            void queryClient.invalidateQueries({ queryKey });
        });
    }

    return {
        settings: query.data ?? DEFAULT_ADVISOR_SETTINGS,
        ready: query.status === "success",
        save,
    };
}
