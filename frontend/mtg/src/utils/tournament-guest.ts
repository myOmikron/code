/**
 * The guest rows this device joined tournaments as; the claim token is the device's only proof.
 */

const STORAGE_KEY = "planarium.tournamentGuests.v1";

/** One guest row this device holds a claim token for */
export type StoredTournamentGuest = {
    /** The tournament the guest row belongs to */
    tournamentUuid: string;
    /** The participant row itself */
    participantUuid: string;
    /** The one-time secret that later claims this row for an account */
    claimToken: string;
};

/**
 * Narrows an unknown parsed value to a stored guest entry
 *
 * @param value candidate parsed from storage
 *
 * @returns whether it has the right shape
 */
function isStoredTournamentGuest(value: unknown): value is StoredTournamentGuest {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<StoredTournamentGuest>;
    return (
        typeof candidate.tournamentUuid === "string" &&
        typeof candidate.participantUuid === "string" &&
        typeof candidate.claimToken === "string"
    );
}

/**
 * Reads every guest row this device is holding
 *
 * @returns the stored entries, or an empty list
 */
export function listTournamentGuests(): Array<StoredTournamentGuest> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(isStoredTournamentGuest) : [];
    } catch {
        return [];
    }
}

/**
 * Writes the whole list back to storage
 *
 * @param entries what to persist
 */
function save(entries: Array<StoredTournamentGuest>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Storage unavailable: the entry is not kept.
    }
}

/**
 * Remembers a freshly joined guest row, replacing any earlier one for the same tournament
 *
 * @param entry what to remember
 */
export function addTournamentGuest(entry: StoredTournamentGuest): void {
    const rest = listTournamentGuests().filter((stored) => stored.tournamentUuid !== entry.tournamentUuid);
    save([...rest, entry]);
}

/**
 * Forgets a guest row, e.g. once its claim went through or its token turned out stale
 *
 * @param tournamentUuid the tournament whose entry should be dropped
 */
export function removeTournamentGuest(tournamentUuid: string): void {
    save(listTournamentGuests().filter((stored) => stored.tournamentUuid !== tournamentUuid));
}
