import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { GraphApi } from "src/api/graph";

/** How often the warm is asked whether it has landed */
const POLL_MS = 3000;

/**
 * How many times, before the wait is given up on.
 *
 * The EDHREC fetch a warm waits on times out at 30s and the server runs two
 * warm workers, so a commander queued behind another can wait through two of
 * those windows. Twenty polls is a minute — comfortably past that, where the
 * old cap (eight polls of the suggestions request itself) expired at about
 * thirty seconds, which is to say exactly when the fetch it was waiting for
 * was still allowed to be running.
 */
const MAX_POLLS = 20;

/**
 * Refreshes the advisor once a commander's EDHREC data finishes warming.
 *
 * The advisor answers immediately for a cold commander and says so in a
 * `edhrec-pending` note rather than blocking the request on a 30s fetch. That
 * leaves the reader holding a provisional answer with nothing to tell them
 * when the real one is available.
 *
 * The cheap question is asked instead of the expensive one: `/warm` reports
 * its own status for the price of one indexed lookup, so it is what gets
 * polled, and the suggestion request — a full solve — is re-run exactly once,
 * when there is finally a different answer to get. Every graph query is
 * invalidated, not only the one that carried the note: the warm changes what
 * the diagnostics and the combo list say too, and the reader may be looking at
 * either.
 *
 * @param commanders every commander the deck fields
 * @param pending whether the answer on screen says a warm is still running
 */
export function useEdhrecWarm(commanders: Array<string>, pending: boolean): void {
    const client = useQueryClient();
    const key = commanders.join(",");

    const { data: settled } = useQuery({
        queryKey: ["edhrec-warm", key],
        queryFn: async ({ signal }) => {
            const answers = await Promise.all(
                commanders.map((commander) => GraphApi.warm({ commander_oracle_id: commander }, { signal })),
            );
            // `unknown` is the graph saying it has never heard of the card;
            // waiting for that to warm would wait forever.
            return answers.every(({ status }) => status === "warm" || status === "unknown");
        },
        enabled: pending && commanders.length > 0,
        // Deliberately not the session-long default: this asks about state
        // that changes while nobody edits anything, which is the one thing the
        // rest of the advisor's caching assumes cannot happen.
        staleTime: 0,
        refetchInterval: (query) =>
            query.state.data === true || query.state.dataUpdateCount >= MAX_POLLS ? false : POLL_MS,
    });

    useEffect(() => {
        if (settled !== true) return;
        void client.invalidateQueries({ queryKey: ["graph-query"] });
    }, [settled, client]);
}
