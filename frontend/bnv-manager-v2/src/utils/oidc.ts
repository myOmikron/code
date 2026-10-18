/** Error codes the backend sends to the oidc error page */
export const OIDC_ERROR_CODES = ["unknown-request", "unknown-client", "invalid-redirect-uri"] as const;

/** An error code the oidc error page knows a message for */
export type OidcErrorCode = (typeof OIDC_ERROR_CODES)[number];

/**
 * Search parameters of the oidc error routes
 */
export type OidcErrorSearch = {
    /** The error to display, `undefined` for unknown codes */
    error?: OidcErrorCode;
};

/**
 * Validate the search of the oidc error routes, dropping unknown error codes
 *
 * @param search The raw search parameters
 *
 * @returns The known error code, if any
 */
export function validateOidcErrorSearch(search: Record<string, unknown>): OidcErrorSearch {
    const error = OIDC_ERROR_CODES.find((code) => code === search?.error);
    return error ? { error } : {};
}

/**
 * Search parameters of the oidc login routes
 */
export type OidcAuthSearch = {
    /** The pending authorization request to resume after the login */
    request_id?: string;
    /** Internal path to navigate to after the login, when there is no pending request */
    redirect_url?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate the search of the oidc login routes
 *
 * The request id must be a uuid and the redirect an internal path; anything else is dropped,
 * so the login page never navigates to an external or `javascript:` url.
 *
 * @param search The raw search parameters
 *
 * @returns The valid return target
 */
export function validateOidcAuthSearch(search: Record<string, unknown>): OidcAuthSearch {
    const requestId = search?.request_id;
    if (typeof requestId === "string" && UUID.test(requestId)) {
        return { request_id: requestId };
    }
    const redirectUrl = internalPath(search?.redirect_url);
    return redirectUrl ? { redirect_url: redirectUrl } : {};
}

/**
 * Check that a value is a path on this origin
 *
 * @param value The value to check
 *
 * @returns The path with search and hash, or `undefined` if it leads off this origin
 */
export function internalPath(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.startsWith("/")) {
        return undefined;
    }
    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) {
            return undefined;
        }
        return url.pathname + url.search + url.hash;
    } catch {
        return undefined;
    }
}

/**
 * The backend url resuming a pending authorization request
 *
 * @param requestId The id of the pending authorization request
 *
 * @returns The url to navigate the browser to
 */
export function finishAuthUrl(requestId: string): string {
    return `/api/v1/auth/finish-auth?${new URLSearchParams({ request_id: requestId })}`;
}
