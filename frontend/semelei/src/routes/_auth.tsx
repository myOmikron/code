import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { StaffLayout } from "src/components/staff-layout";
import { LoginProvider } from "src/context/login";

/**
 * Pathless layout guarding everything below it behind authentication and
 * providing one shared, non-nested navigation shell.
 *
 * @returns the guarded outlet
 */
function AuthLayoutRoute() {
    return (
        <LoginProvider>
            <StaffLayout />
        </LoginProvider>
    );
}

export const Route = createFileRoute("/_auth")({
    component: AuthLayoutRoute,
});
