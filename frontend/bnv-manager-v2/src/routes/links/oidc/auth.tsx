import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Props for {@link LinkAuthentication}
 */
export type LinkAuthenticationProps = {};

/**
 * Link to oidc authentication
 */
export default function LinkAuthentication(props: LinkAuthenticationProps) {
    const search = Route.useSearch();

    return <Navigate to={"/oidc/auth"} search={search} />;
}

/**
 * Search parameters for the oidc authentication route
 */
type SearchParams = {
    /** Uri to redirect to after successful authentication */
    redirect_url: string;
    /** Whether to stay in this SPA */
    external: true;
};

export const Route = createFileRoute("/links/oidc/auth")({
    component: LinkAuthentication,
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        return {
            redirect_url: search?.redirect_url as string | "/",
            external: true,
        };
    },
    loaderDeps: ({ search: { redirect_url, external } }) => ({ redirect_url, external }),
});
