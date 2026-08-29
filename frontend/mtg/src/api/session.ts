/** Told that the server refused a request for want of a session */
type SessionExpiredListener = () => void;

/**
 * Carries "the server says there is no session" from the api layer to the app.
 *
 * Its own module rather than a part of the account context: `api.tsx` reports here, and
 * the account context reads `api.tsx` — sharing a file would make that a cycle.
 */
class SessionStore {
    private listener: SessionExpiredListener | null = null;

    /**
     * Register the listener, replacing whoever was there.
     *
     * Last one wins: the provider re-subscribes whenever the closure it hands over goes
     * stale, and under `StrictMode` it subscribes twice on mount.
     *
     * @param listener what to run when a request comes back 401
     */
    subscribe(listener: SessionExpiredListener) {
        this.listener = listener;
    }

    /** Report that a request needing an account was refused */
    expired() {
        this.listener?.();
    }
}

export const SESSION_STORE = new SessionStore();
