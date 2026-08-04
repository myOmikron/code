import { createFileRoute, Navigate } from "@tanstack/react-router";
import ACCOUNT_CONTEXT from "src/context/account";
import React from "react";

/**
 * Props for {@link Index}
 */
export type IndexProps = {};

/**
 * Index route
 */
export default function Index(props: IndexProps) {
    const ctx = React.useContext(ACCOUNT_CONTEXT);

    if (ctx.account.role.type === "SuperAdmin") {
        return <Navigate to={"/a/clubs"} />;
    } else if (ctx.account.role.type === "ClubAdmin") {
        return <Navigate to={"/ca/$clubId/dashboard"} params={{ clubId: ctx.account.role.club }} />;
    } else if (ctx.account.role.type === "ClubMember") {
        return <Navigate to={"/m/dashboard"} />;
    }
}

export const Route = createFileRoute("/_menu/")({
    component: Index,
});
