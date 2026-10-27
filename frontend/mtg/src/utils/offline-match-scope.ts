import { FetchError } from "src/api/generated";

/** The last verified Account eligible to reopen its own local recording during a transport failure. */
export type OfflineMatchScope = { account: string; epoch: string };
/** The identity-only marker; it never makes an Account authenticated. */
export const OFFLINE_MATCH_SCOPE_KEY = "cardlens.offline-match-scope.v1";
/** Notifies the current tab when the verified session's recovery scope changes. */
export const OFFLINE_MATCH_SCOPE_CHANGED = "mtg-offline-match-scope-changed";

/**
 * Reads the narrow recovery identity without restoring a signed-in Account.
 *
 * @returns the last verified scope, or null after logout/expiry
 */
export function readOfflineMatchScope(): OfflineMatchScope | null {
    try {
        const scope = JSON.parse(localStorage.getItem(OFFLINE_MATCH_SCOPE_KEY) ?? "null");
        return typeof scope?.account === "string" && typeof scope?.epoch === "string" ? scope : null;
    } catch {
        return null;
    }
}

/**
 * Retains a verified Account identity, or invalidates all offline recovery access after a session ends.
 *
 * @param account verified Account identity, or null when the session ends
 */
export function setOfflineMatchAccount(account: string | null): void {
    try {
        if (account === null) localStorage.removeItem(OFFLINE_MATCH_SCOPE_KEY);
        else if (readOfflineMatchScope()?.account !== account) {
            localStorage.removeItem(OFFLINE_MATCH_SCOPE_KEY);
            localStorage.setItem(OFFLINE_MATCH_SCOPE_KEY, JSON.stringify({ account, epoch: crypto.randomUUID() }));
        }
    } catch {
        return;
    } finally {
        window.dispatchEvent(new Event(OFFLINE_MATCH_SCOPE_CHANGED));
    }
}

/**
 * Allows recovery only for a failed transport, never an HTTP authorization or visibility refusal.
 *
 * @param error raw generated-client failure
 * @returns whether the network failed before an HTTP response
 */
export function isMatchTransportFailure(error: unknown): boolean {
    return (
        error instanceof FetchError ||
        (error instanceof DOMException && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name))
    );
}
