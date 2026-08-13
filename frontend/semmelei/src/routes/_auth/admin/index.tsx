import { Navigate, createFileRoute } from "@tanstack/react-router";
import React from "react";

export const Route = createFileRoute("/_auth/admin/")({
    component: () => <Navigate to={"/admin/items"} />,
});
