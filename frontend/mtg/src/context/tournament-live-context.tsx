import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ALL_TOPICS, parseTournamentEvent, topicsOf } from "src/utils/tournament-live";
import type { LiveTopic } from "src/utils/tournament-live";

/**
 * How often each topic of a Tournament changed since the page opened; a tab that puts its
 * topic's count among the dependencies of its load fetches again on every change
 */
type LiveVersions = Record<LiveTopic, number>;

const START: LiveVersions = { tournament: 0, participants: 0, rounds: 0, standings: 0 };

const TournamentLiveContext = createContext<LiveVersions>(START);

/** Props of {@link TournamentLiveProvider} */
type TournamentLiveProviderProps = {
    /** The Tournament's event stream */
    url: string;
    /** Fetches the Tournament itself again */
    onTournamentChanged: () => void;
    /** The tabs that follow the changes */
    children: ReactNode;
};

/**
 * Follows a Tournament's event stream and tells the tabs below what changed
 *
 * The browser reconnects a dropped stream by itself; after a reconnect everything is
 * fetched again, since events may have been missed in between.
 */
export function TournamentLiveProvider({ url, onTournamentChanged, children }: TournamentLiveProviderProps) {
    const [versions, setVersions] = useState<LiveVersions>(START);
    const tournamentChanged = useRef(onTournamentChanged);

    useEffect(() => {
        tournamentChanged.current = onTournamentChanged;
    }, [onTournamentChanged]);

    useEffect(() => {
        const source = new EventSource(url);
        let reconnect = false;

        /**
         * Counts a change of `topics`
         *
         * @param topics what changed
         */
        function changed(topics: LiveTopic[]) {
            setVersions((held) => {
                const next = { ...held };
                for (const topic of topics) next[topic] += 1;
                return next;
            });
            if (topics.includes("tournament")) tournamentChanged.current();
        }

        source.onopen = () => {
            if (reconnect) changed(ALL_TOPICS);
            reconnect = true;
        };
        source.onmessage = (message: MessageEvent<string>) => changed(topicsOf(parseTournamentEvent(message.data)));
        return () => source.close();
    }, [url]);

    return <TournamentLiveContext value={versions}>{children}</TournamentLiveContext>;
}

/**
 * How often `topic` of the Tournament on this page changed, for the dependencies of a load
 *
 * @param topic what the caller shows
 * @returns a count that grows with every change
 */
export function useLiveVersion(topic: LiveTopic): number {
    return useContext(TournamentLiveContext)[topic];
}
