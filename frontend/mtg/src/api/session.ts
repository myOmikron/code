/**
 * Listener which runs when the server rejected a request as unauthenticated
 */
type SessionExpiredListener = () => void;

/**
 * Signals an expired session to the app and has to be a singleton
 */
class SessionStore {
    private listener: SessionExpiredListener | null = null;

    /**
     * Register the listener
     *
     * @param listener SessionExpiredListener
     */
    subscribe(listener: SessionExpiredListener) {
        this.listener = listener;
    }

    /**
     * Triggers the listener
     */
    expired() {
        if (this.listener) {
            this.listener();
        }
    }
}

export const SESSION_STORE = new SessionStore();
