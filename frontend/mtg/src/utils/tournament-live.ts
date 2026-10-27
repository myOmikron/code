import type { TournamentEvent } from "src/api/generated";

/** What a Tournament page shows and fetches on its own */
export type LiveTopic = "tournament" | "participants" | "rounds" | "standings";

/** Every topic, for a reader that may have missed events */
export const ALL_TOPICS: LiveTopic[] = ["tournament", "participants", "rounds", "standings"];

/** What each kind of event makes the page fetch again */
const TOPICS: Record<TournamentEvent["kind"], LiveTopic[]> = {
    TournamentChanged: ALL_TOPICS,
    ParticipantsChanged: ["participants", "rounds"],
    OrganizersChanged: ["tournament"],
    DecksChanged: ["participants", "standings"],
    RoundPaired: ["rounds"],
    RoundDiscarded: ["rounds"],
    PreviewOutdated: ["rounds"],
    RoundStarted: ["rounds", "tournament"],
    RoundEnded: ["rounds", "tournament"],
    RoundTakenBack: ["rounds", "tournament"],
    TimerChanged: ["rounds"],
    ResultReported: ["rounds"],
    ResultDisputed: ["rounds"],
    ResultSet: ["rounds"],
    StandingsChanged: ["standings"],
    Resync: ALL_TOPICS,
};

/**
 * What a page fetches again after `event`
 *
 * @param event what changed in the Tournament
 * @returns the topics to fetch again
 */
export function topicsOf(event: TournamentEvent): LiveTopic[] {
    return TOPICS[event.kind];
}

/**
 * Reads the data of one Server-Sent Event of a Tournament's stream
 *
 * Anything it cannot read counts as a resync, so the page never misses a change.
 *
 * @param data the event's `data`
 * @returns the event
 */
export function parseTournamentEvent(data: string): TournamentEvent {
    let parsed: unknown;
    try {
        parsed = JSON.parse(data);
    } catch {
        return { kind: "Resync" };
    }
    if (
        typeof parsed === "object" &&
        parsed !== null &&
        "kind" in parsed &&
        typeof parsed.kind === "string" &&
        Object.hasOwn(TOPICS, parsed.kind)
    ) {
        return parsed as TournamentEvent;
    }
    return { kind: "Resync" };
}

/**
 * The event stream of a Tournament read by its id
 *
 * @param tournament the Tournament's uuid
 * @returns the stream's url
 */
export function tournamentEventsUrl(tournament: string): string {
    return `/api/frontend/v1/tournaments/${encodeURIComponent(tournament)}/events`;
}

/**
 * The event stream of a Tournament read through its share link
 *
 * @param token the share token
 * @returns the stream's url
 */
export function sharedTournamentEventsUrl(token: string): string {
    return `/api/frontend/v1/shared/tournaments/${encodeURIComponent(token)}/events`;
}
