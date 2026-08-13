import { Navigate, useLocation } from "@tanstack/react-router";
import React from "react";
import { Api } from "src/api/api";
import { MeResponse } from "src/api/generated";

/** Value provided by the {@link LoginProvider} */
export type LoginContextValue = {
    /** The logged-in account */
    me: MeResponse;
    /** Re-fetch the account (e.g. after logout) */
    reset: () => void;
};

export const LOGIN_CONTEXT = React.createContext<LoginContextValue>({
    me: { uuid: "", username: "", role: "Verkauf" },
    /** No-op outside a {@link LoginProvider} */
    reset: () => {},
});

/**
 * The properties for {@link LoginProvider}
 */
export type LoginProviderProps = {
    /** The children to render once authenticated */
    children: React.ReactNode;
};

/**
 * Guards the staff area: loads the account via `/auth/me`,
 * redirecting to the login page if the session is not authenticated.
 *
 * @param props {@link LoginProviderProps}
 *
 * @returns the provider
 */
export function LoginProvider(props: LoginProviderProps) {
    const [state, setState] = React.useState<"loading" | "unauthenticated" | MeResponse>("loading");
    const location = useLocation();

    const fetchMe = React.useCallback(() => {
        Api.auth
            .me()
            .then(setState)
            .catch(() => setState("unauthenticated"));
    }, []);

    React.useEffect(fetchMe, [fetchMe]);

    switch (state) {
        case "loading":
            return null;
        case "unauthenticated":
            return <Navigate to={"/login"} search={{ redirect_url: location.pathname }} />;
        default:
            return (
                <LOGIN_CONTEXT.Provider value={{ me: state, reset: fetchMe }}>{props.children}</LOGIN_CONTEXT.Provider>
            );
    }
}
