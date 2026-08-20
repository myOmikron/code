import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "src/components/route-error";
import { VersionWarning } from "src/components/version-warning";
import { AccountProvider } from "src/context/account";
import { ErrorContext } from "src/context/error-context";
import { InstallProvider } from "src/context/install-context";
import { ScanSessionsProvider } from "src/context/scan-sessions-context";

export const Route = createRootRoute({
    component: RootLayout,
    errorComponent: (err) => <RouteError {...err} />,
});

function RootLayout() {
    return (
        <AccountProvider>
            <ErrorContext />
            {/* Above the outlet, so every layout — menu, scanner, auth — carries
                the 0.x warning without knowing about it. The layouts all size
                with `min-h-svh`, so a line before them just flows on top. */}
            <VersionWarning />
            <InstallProvider>
                {/* At the root rather than in a scan layout: the overview and review live
                    under the menu chrome while the camera runs chrome-less, and both sides
                    must share one state — plus the collection page starts sessions too. */}
                <ScanSessionsProvider>
                    <Outlet />
                </ScanSessionsProvider>
            </InstallProvider>
        </AccountProvider>
    );
}
