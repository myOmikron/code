import { createRootRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "src/components/route-error";
import { VersionWarning } from "src/components/version-warning";
import { AccountProvider } from "src/context/account";
import { ErrorContext } from "src/context/error-context";
import { InstallProvider } from "src/context/install-context";
import { PendingScansProvider } from "src/context/pending-scans-context";
import { ScannerSessionsProvider } from "src/context/scanner-session-context";

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
                {/* The buffer inside the sessions, not beside them: what the scanner puts
                    into the buffer is pushed into the open session, and every screen that shows
                    "staged" reads the session. */}
                <PendingScansProvider>
                    <ScannerSessionsProvider>
                        <Outlet />
                    </ScannerSessionsProvider>
                </PendingScansProvider>
            </InstallProvider>
        </AccountProvider>
    );
}
