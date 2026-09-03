import { Navigate, Outlet, createFileRoute, useSearch } from "@tanstack/react-router";
import { useAccount } from "src/context/account";

export const Route = createFileRoute("/_menu/auth")({ component: AuthLayoutRoute });

/**
 * Layout for the whole auth path.
 *
 * Everything under `/auth` exists to get somebody *into* an account: signing in,
 * signing up, redeeming a registration link. None of it makes sense once a
 * session is there, so a logged-in visitor is sent to the app instead.
 *
 * Renders nothing while the session check runs — redirecting early would bounce
 * a logged-out visitor off the login page they just opened.
 *
 * The bounce honours the `redirect` search param the login and signup routes
 * validate: the moment a login succeeds, the session refresh re-renders this
 * layout *before* the login page gets to navigate itself, so the deep link a
 * visitor came from (`/join/{code}`) would otherwise be lost to `/home` here.
 * Re-checked for the same-site shape, since `strict: false` hands over the raw
 * search of whichever child route is active.
 *
 * @returns the auth section
 */
function AuthLayoutRoute() {
    const { account, loading } = useAccount();
    const search = useSearch({ strict: false }) as { redirect?: unknown };
    const redirect =
        typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
            ? search.redirect
            : undefined;

    if (loading) return null;
    if (account !== null) return <Navigate to={redirect ?? "/home"} replace={true} />;
    return <Outlet />;
}
