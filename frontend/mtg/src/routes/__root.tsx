import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ImpersonationBanner } from "src/components/impersonation-banner";
import { RouteError } from "src/components/route-error";
import { VersionWarning } from "src/components/version-warning";
import { TournamentParticipationProvider } from "src/context/tournament-participation-context";
import { AccountProvider } from "src/context/account";
import { ChromeProvider } from "src/context/chrome-context";
import type { Chrome } from "src/context/chrome-context";
import { ErrorContext } from "src/context/error-context";
import { InstallProvider } from "src/context/install-context";
import { PendingScansProvider } from "src/context/pending-scans-context";
import { ScannerSessionsProvider } from "src/context/scanner-session-context";

export const Route = createRootRoute({
    component: RootLayout,
    errorComponent: (err) => <RouteError {...err} />,
});

function RootLayout() {
    const [bare, setBare] = useState(false);
    const chrome = useMemo<Chrome>(() => ({ bare, setBare }), [bare]);
    return (
        <ChromeProvider value={chrome}>
            <AccountProvider>
                <TournamentParticipationProvider>
                    <ErrorContext />
                    <ImpersonationBanner />
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
                </TournamentParticipationProvider>
            </AccountProvider>
        </ChromeProvider>
    );
}
