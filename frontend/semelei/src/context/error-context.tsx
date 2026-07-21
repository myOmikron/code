import { Navigate } from "@tanstack/react-router";
import React, { useEffect } from "react";

/**
 * Function which should trigger in case of error
 */
type ErrorListener = (error: unknown) => void;

/**
 * Handler for errors and has to be a singleton
 */
class ErrorStore {
    private listener: ErrorListener | null = null;

    /**
     * Register a new ErrorListener
     *
     * @param listener ErrorListener
     */
    subscribe(listener: ErrorListener) {
        if (!this.listener) {
            this.listener = listener;
        }
    }

    /**
     * Triggers for all listener the ErrorListener
     *
     * @param error error
     */
    report(error: unknown) {
        if (this.listener) {
            this.listener(error);
        }
    }
}

export const ERROR_STORE = new ErrorStore();

/**
 * The properties for {@link ErrorContext}
 */
export type ErrorContextProps = {};

/**
 * Error Container which stays in the root and has to be a singleton
 */
export function ErrorContext(props: ErrorContextProps) {
    const [error, setError] = React.useState<unknown>(null);

    useEffect(() => {
        ERROR_STORE.subscribe(setError);
    }, []);

    // Session expired while using the staff area: back to the login page.
    // Public shop endpoints never return 401.
    if (error === "Unauthorized") {
        return <Navigate to={"/login"} search={{ redirect_url: location.pathname }} />;
    }

    if (error) {
        throw error;
    }

    return undefined;
}
