import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Api } from "src/api/api";
import type { MyTournamentsResponse } from "src/api/generated";
import { useAccount } from "src/context/account";
import { parseTournamentEvent, topicsOf, tournamentEventsUrl } from "src/utils/tournament-live";

/** The browser event emitted when participation may have changed on a Tournament page */
export const PARTICIPATION_CHANGED = "mtg-tournament-participation-changed";

const ParticipationContext = createContext<MyTournamentsResponse | null>(null);

/**
 * Shares account-scoped participation with navigation and Tournament lists.
 *
 * @returns the provider around the app
 */
export function TournamentParticipationProvider({ children }: { children: ReactNode }) {
    const { account } = useAccount();
    const identity = account?.uuid ?? null;
    const path = useRouterState({ select: (state) => state.location.pathname });
    const [stored, setStored] = useState<{ identity: string; data: MyTournamentsResponse } | null>(null);
    const sequence = useRef(0);
    const refresh = useRef<() => void>(() => undefined);
    const data = identity !== null && stored?.identity === identity ? stored.data : null;
    const ongoingIds = useMemo(() => [...(data?.ongoing_participations ?? [])].sort().join(","), [data]);

    useEffect(() => {
        if (identity === null) return;
        let gone = false;
        const load = () => {
            const request = ++sequence.current;
            void Api.tournaments
                .mineForNavigation()
                .then((next) => {
                    if (!gone && request === sequence.current) setStored({ identity, data: next });
                })
                .catch(() => {
                    if (!gone && request === sequence.current) setStored(null);
                });
        };
        refresh.current = load;
        const visible = () => {
            if (document.visibilityState === "visible") load();
        };
        load();
        window.addEventListener("focus", visible);
        document.addEventListener("visibilitychange", visible);
        window.addEventListener(PARTICIPATION_CHANGED, load);
        const interval = window.setInterval(visible, 60_000);
        return () => {
            gone = true;
            refresh.current = () => undefined;
            window.clearInterval(interval);
            window.removeEventListener("focus", visible);
            document.removeEventListener("visibilitychange", visible);
            window.removeEventListener(PARTICIPATION_CHANGED, load);
        };
    }, [identity, path]);

    useEffect(() => {
        if (identity === null || ongoingIds === "") return;
        const sources = ongoingIds.split(",").map((uuid) => {
            const source = new EventSource(tournamentEventsUrl(uuid));
            let connected = false;
            source.onopen = () => {
                if (connected) refresh.current();
                connected = true;
            };
            source.onmessage = (message: MessageEvent<string>) => {
                const topics = topicsOf(parseTournamentEvent(message.data));
                if (topics.includes("tournament") || topics.includes("participants")) refresh.current();
            };
            return source;
        });
        return () => sources.forEach((source) => source.close());
    }, [identity, ongoingIds]);

    return <ParticipationContext value={data}>{children}</ParticipationContext>;
}

/**
 * Returns only the participation belonging to the currently signed-in Account.
 *
 * @returns the current Account's participation, or null while unavailable
 */
export function useTournamentParticipation(): MyTournamentsResponse | null {
    return useContext(ParticipationContext);
}
