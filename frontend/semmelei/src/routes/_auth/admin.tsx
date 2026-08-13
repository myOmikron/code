import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import React from "react";
import { LOGIN_CONTEXT } from "src/context/login";

/**
 * Admin role gate. Navigation is provided once by the shared auth layout,
 * keeping this route free of nested interface chrome.
 *
 * @returns the layout
 */
function AdminLayout() {
    const { me } = React.useContext(LOGIN_CONTEXT);

    if (me.role !== "Admin") {
        return <Navigate to={"/verkauf"} />;
    }

    return <Outlet />;
}

export const Route = createFileRoute("/_auth/admin")({
    component: AdminLayout,
});
