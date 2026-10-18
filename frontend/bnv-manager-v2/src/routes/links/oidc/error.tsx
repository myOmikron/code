import { createFileRoute, Navigate } from "@tanstack/react-router";
import { validateOidcErrorSearch } from "src/utils/oidc";

/**
 * Props for {@link LinkOidcError}
 */
export type LinkOidcErrorProps = {};

/**
 * Link to the oidc error page
 */
export default function LinkOidcError(props: LinkOidcErrorProps) {
    const search = Route.useSearch();

    return <Navigate to={"/oidc/error"} search={search} />;
}

export const Route = createFileRoute("/links/oidc/error")({
    component: LinkOidcError,
    validateSearch: validateOidcErrorSearch,
});
