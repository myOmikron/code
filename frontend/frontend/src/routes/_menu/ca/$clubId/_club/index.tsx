import { createFileRoute, Navigate } from "@tanstack/react-router";

import React from "react";

/**
 * The properties for {@link ClubAdminIndex}
 */
export type ClubAdminIndexProps = {};

/**
 * Index for admins that show a single club
 */
export default function ClubAdminIndex(props: ClubAdminIndexProps) {
    const params = Route.useParams();
    return <Navigate to={"/ca/$clubId/dashboard"} params={params} />;
}

export const Route = createFileRoute("/_menu/ca/$clubId/_club/")({
    component: ClubAdminIndex,
});
