//! Persistence of a signup's `redirect` search param across the mail round-trip.
//!
//! `login.tsx`'s `redirect` survives because the login form never leaves the page it started on
//! — the search param just rides along. A signup does not: the account confirms by mail, often
//! days later, by opening a registration link on `register.tsx`, a page with no search param of
//! its own to carry the destination. This stashes it locally instead, for `register.tsx` to read
//! back once the passkey ceremony is done and hand to `login.tsx`, which validates it again.

const STORAGE_KEY = "planarium.signupRedirect.v1";

/**
 * Remembers a signup's `redirect` target for when the registration link is opened later
 *
 * @param path the same-site path to return to — the caller has already validated it
 */
export function rememberSignupRedirect(path: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, path);
    } catch {
        // storage unavailable (private mode) — the redirect simply does not survive the trip
    }
}

/**
 * Reads back a remembered redirect and forgets it — one-shot, like the registration link itself
 *
 * @returns the stored path, or `null` if none was stashed (or storage is unavailable)
 */
export function takeSignupRedirect(): string | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        return value;
    } catch {
        return null;
    }
}
