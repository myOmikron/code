import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button, Heading, Text } from "components";
import { CardIndexProvider } from "../context/card-index-context";
import { PendingScansProvider } from "../context/pending-scans-context";
import { ScanScopeProvider } from "../context/scan-scope-context";

/** Last-resort screen for an error that escaped a route. Offers a retry rather than a dead end,
 *  because the most likely cause is a failed index load rather than broken code. */
function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="grid min-h-svh place-items-center px-5">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-[22px] border border-line bg-[#1b1d19] p-8">
        <Heading level={1}>Da ging etwas schief</Heading>
        <Text>{error.message}</Text>
        <Button color="lime" onClick={reset}>Nochmal versuchen</Button>
        <Button plain href="/scan">Zum Scanner</Button>
      </div>
    </main>
  );
}

/** The app shell: shared state above the router outlet, and the persistent bottom navigation.
 *  Providers live here so navigating between the scan steps never restarts the index load — the
 *  ~110k-route decode is the app's most expensive startup step — nor drops the staged scans.
 *  Past `lg` the phone frame is dropped for the full width. */
function RootLayout() {
  return (
    <CardIndexProvider>
      <PendingScansProvider>
        <ScanScopeProvider>
          <div className="relative mx-auto min-h-svh w-full max-w-120 overflow-hidden bg-ink shadow-[0_0_80px_rgba(0,0,0,.55)] md:min-h-[calc(100svh-48px)] md:rounded-[32px] md:border md:border-white/8 lg:m-0 lg:min-h-svh lg:max-w-none lg:overflow-visible lg:rounded-none lg:border-0 lg:shadow-none">
            <Outlet />
          </div>
        </ScanScopeProvider>
      </PendingScansProvider>
    </CardIndexProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
});
