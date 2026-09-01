//! Persistence of the guest rows this device has joined tournaments as.
//!
//! A guest row has no account behind it — the claim token is this device's only proof it is the
//! one that joined. Keeping it lets the roster page reopen without re-typing a code, and lets an
//! account signed in later claim the row automatically (see the `/tournaments` list page).

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
        // storage unavailable (private mode) — the entry simply does not persist
    }
}

/**
 * Remembers a freshly joined guest row on this device
 *
 * Replaces any existing entry for the same tournament: a device holds at most one guest row per
 * event, and the newest join is the one worth keeping.
 *
 * @param entry what to remember
 */
export function addTournamentGuest(entry: StoredTournamentGuest): void {
    const rest = listTournamentGuests().filter((stored) => stored.tournamentUuid !== entry.tournamentUuid);
    save([...rest, entry]);
}

/**
 * Forgets a guest row, e.g. once its account claim went through (or its token turned out stale)
 *
 * @param tournamentUuid the tournament whose entry should be dropped
 */
export function removeTournamentGuest(tournamentUuid: string): void {
    save(listTournamentGuests().filter((stored) => stored.tournamentUuid !== tournamentUuid));
}
