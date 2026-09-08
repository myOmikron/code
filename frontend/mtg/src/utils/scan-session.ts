//! Which staging area this device is filling.
//!
//! The sessions themselves live on the server, so this is only the pointer: which of them the
//! scanner on *this* phone is adding to. It is a device's choice rather than an account's — a
//! phone sorting a box and a desk correcting last night's stack are looking at different sessions
//! at the same time, and neither should move the other.

/** Where the pointer is kept */
const STORAGE_KEY = "cardlens.scanSession.v2";

/**
 * The session this device is filling
 *
 * @returns its primary key, or null when none was chosen yet
 */
export function activeSessionUuid(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Private mode and blocked storage cost the choice, not the scanner.
        return null;
    }
}

/**
 * Remembers which session this device fills
 *
 * @param session its primary key, or null to forget
 */
export function rememberActiveSession(session: string | null): void {
    try {
        if (session === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, session);
    } catch {
        // As above: not remembering is survivable, failing to scan is not.
    }
}
