import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
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
 * @returns the auth section
 */
function AuthLayoutRoute() {
    const { account, loading } = useAccount();

    if (loading) return null;
    if (account !== null) return <Navigate to={"/home"} replace={true} />;
    return <Outlet />;
}
