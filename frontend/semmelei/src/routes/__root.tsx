import { createRootRoute, Outlet } from "@tanstack/react-router";
import React from "react";
import { ErrorContext } from "src/context/error-context";
import { RouteError } from "src/components/route-error";

export const Route = createRootRoute({
    component: () => (
        <>
            <ErrorContext />
            <Outlet />
        </>
    ),

    errorComponent: (err) => <RouteError {...err} />,
});
