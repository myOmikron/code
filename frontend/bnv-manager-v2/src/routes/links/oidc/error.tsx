import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Props for {@link LinkOidcError}
 */
export type LinkOidcErrorProps = {};

/**
 * Link to oidc authentication
 */
export default function LinkOidcError(props: LinkOidcErrorProps) {
    const search = Route.useSearch();

    return <Navigate to={"/oidc/error"} search={search} />;
}

/**
 * Search parameters for the oidc error route
 */
type ErrorParams = {
    /** The errors to display */
    error: string;
};

export const Route = createFileRoute("/links/oidc/error")({
    component: LinkOidcError,
    validateSearch: (search: Record<string, unknown>): ErrorParams => {
        return {
            error: search?.error as string | "/",
        };
    },
    loaderDeps: ({ search: { error } }) => ({ error }),
});
