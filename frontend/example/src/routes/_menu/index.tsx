import { createFileRoute } from "@tanstack/react-router";

import React from "react";

/**
 * The properties for {@link Dashboard}
 */
export type DashboardProps = {};

/**
 * Dashboard for the example platform
 */
export default function Dashboard(props: DashboardProps) {
    return <div></div>;
}

export const Route = createFileRoute("/_menu/")({
    component: Dashboard
});
