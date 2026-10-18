import { createFileRoute, Navigate } from "@tanstack/react-router";
import { validateOidcAuthSearch } from "src/utils/oidc";

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

export const Route = createFileRoute("/links/oidc/auth")({
    component: LinkAuthentication,
    validateSearch: validateOidcAuthSearch,
});
