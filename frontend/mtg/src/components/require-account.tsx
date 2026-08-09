import { Navigate, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAccount } from "src/context/account";

/**
 * The properties for {@link RequireAccount}
 */
export type RequireAccountProps = {
    children: ReactNode;
};

/**
 * Renders its children only for a logged-in account, and sends everyone else to the login.
 *
 * Renders nothing while the session check runs — redirecting early would bounce a logged-in
 * user out of a deep link.
 *
 * @returns the guarded subtree
 */
export function RequireAccount({ children }: RequireAccountProps) {
    const { account, loading } = useAccount();
    const location = useLocation();

    if (loading) return null;
    if (account === null) {
        return <Navigate to={"/auth/login"} search={{ redirect: location.pathname }} />;
    }
    return children;
}
