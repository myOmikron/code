import { notify } from "components";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { SESSION_STORE } from "src/api/session";
import type { MeResponse } from "src/api/generated";

/**
 * Who is logged in, if anyone.
 *
 * Not a guard: the chrome needs to tell "not logged in" apart from "still checking".
 * Routes that require an account use {@link RequireAccount}.
 */
export type AccountContextValue = {
    /** The logged-in account, or `null` when nobody is */
    account: MeResponse | null;
    /** True while the initial session check is still running */
    loading: boolean;
    /**
     * Re-read the session from the server — call after a successful login
     *
     * Returns the account it found, so a caller can use it without waiting for a re-render.
     */
    refresh: () => Promise<MeResponse | null>;
    /** Drop the session, server-side and here */
    logout: () => Promise<void>;
};

/**
 * How long the session read may take before the app gives up on it.
 *
 * The chrome renders neither the avatar nor the login button while the check is
 * running, so a request that never answers — a stack that is still starting, a
 * gateway routing to nothing — would leave the app with no way in at all. On a
 * deadline the answer becomes "nobody is logged in", which is wrong at worst
 * for as long as the backend is unreachable and shows the login button either
 * way.
 */
const SESSION_DEADLINE_MS = 8_000;

const ACCOUNT_CONTEXT = createContext<AccountContextValue | null>(null);

/**
 * The properties for {@link AccountProvider}
 */
export type AccountProviderProps = {
    children: ReactNode;
};

/**
 * Reads the session once at startup and shares it with the whole app
 *
 * @returns the provider
 */
export function AccountProvider({ children }: AccountProviderProps) {
    const [tg] = useTranslation();
    const [account, setAccount] = useState<MeResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        let current: MeResponse | null;
        try {
            current = await Api.accounts.me(AbortSignal.timeout(SESSION_DEADLINE_MS));
        } catch (error) {
            // A 401 is the normal answer for a visitor, not an error worth reporting.
            // Anything else means the backend did not answer, which is worth a line
            // in the console — the page itself looks the same as for a visitor.
            if (error instanceof DOMException) console.error("session check gave up", error);
            current = null;
        }
        setAccount(current);
        setLoading(false);
        return current;
    }, []);

    // Toasts here rather than at the button, so every caller gets the confirmation.
    const logout = useCallback(async () => {
        await Api.auth.logout();
        setAccount(null);
        notify.success(tg("toast.logged-out"));
    }, [tg]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const accountRef = useRef<MeResponse | null>(null);
    accountRef.current = account;

    useEffect(() => {
        SESSION_STORE.subscribe(() => {
            if (accountRef.current !== null) notify.error(tg("toast.session-expired"));
            setAccount(null);
            setLoading(false);
        });
    }, [tg]);

    const value = useMemo(() => ({ account, loading, refresh, logout }), [account, loading, refresh, logout]);
    return <ACCOUNT_CONTEXT value={value}>{children}</ACCOUNT_CONTEXT>;
}

/**
 * Access the current session
 *
 * @returns who is logged in, plus refresh and logout
 */
export function useAccount(): AccountContextValue {
    const value = useContext(ACCOUNT_CONTEXT);
    if (!value) throw new Error("useAccount must be used inside an AccountProvider");
    return value;
}
