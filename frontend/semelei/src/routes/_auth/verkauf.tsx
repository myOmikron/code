import { Outlet, createFileRoute } from "@tanstack/react-router";
import React from "react";

/**
 * Sales route outlet. The shared auth layout owns the single navigation shell.
 *
 * @returns the layout
 */
function VerkaufLayout() {
    return <Outlet />;
}

export const Route = createFileRoute("/_auth/verkauf")({
    component: VerkaufLayout,
});
