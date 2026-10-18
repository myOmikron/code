import { Navigate, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Role } from "src/api/generated";
import { useAccount } from "src/context/account";

/**
 * The properties for {@link RequireAdmin}
 */
export type RequireAdminProps = {
    children: ReactNode;
};

/**
 * Renders its children only for an Account with the Admin Role.
 *
 * Nobody logged in goes to the login, a Member goes home. Renders nothing while the
 * session check runs, like {@link RequireAccount}.
 *
 * @returns the guarded subtree
 */
export function RequireAdmin({ children }: RequireAdminProps) {
    const { account, loading } = useAccount();
    const location = useLocation();

    if (loading) return null;
    if (account === null) {
        return <Navigate to={"/auth/login"} search={{ redirect: location.pathname }} />;
    }
    if (account.role !== Role.Admin) {
        return <Navigate to={"/"} />;
    }
    return children;
}
