//! Persistence of the last username that signed in.

// Prefilled on the login screen so a returning visitor only has to confirm the passkey. Not a
// credential — the passkey is what proves anything — so this is a convenience, not a secret.
const LAST_USERNAME_KEY = "cardlens.lastUsername.v1";

/**
 * Reads the username that last signed in on this device
 *
 * @returns the stored username, or an empty string
 */
export function loadLastUsername(): string {
    try {
        return localStorage.getItem(LAST_USERNAME_KEY) ?? "";
    } catch {
        return "";
    }
}

/**
 * Stores the username that just signed in
 *
 * @param username the name the login succeeded with
 */
export function saveLastUsername(username: string): void {
    try {
        localStorage.setItem(LAST_USERNAME_KEY, username);
    } catch {
        // storage unavailable (private mode) — the name simply does not persist
    }
}
