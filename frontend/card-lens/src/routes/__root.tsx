import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Icon } from "../components/Icon";
import { CardIndexProvider } from "../context/card-index-context";
import { CollectionProvider } from "../context/collection-context";

/** Last-resort screen for an error that escaped a route. Offers a retry rather than a dead end,
 *  because the most likely cause is a failed index load rather than broken code. */
function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="screen error-screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">FEHLER</p>
          <h1>Da ging etwas schief</h1>
        </div>
      </header>
      <section className="tip-card">
        <Icon name="spark" size={22} />
        <span>
          <strong>{error.name}</strong>
          <p>{error.message}</p>
        </span>
      </section>
      <div className="error-actions">
        <button onClick={reset}>Nochmal versuchen</button>
        <Link to="/">Zum Scanner</Link>
      </div>
    </main>
  );
}

/** The app shell: shared state above the router outlet, and the persistent bottom navigation.
 *  Providers live here so switching tabs never restarts the index load or drops the collection. */
function RootLayout() {
  return (
    <CardIndexProvider>
      <CollectionProvider>
        <div className="app-shell">
          <Outlet />
          <nav className="bottom-nav" aria-label="Hauptnavigation">
            <Link to="/sammlung" activeProps={{ className: "active" }}>
              <Icon name="cards" />
              <span>Sammlung</span>
            </Link>
            {/* The primary destination is the app root, matched exactly so it does not stay
                highlighted while another tab is open. */}
            <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "active" }} className="scan-nav">
              <i>
                <Icon name="scan" size={25} />
              </i>
              <span>Scannen</span>
            </Link>
            <Link to="/decks" activeProps={{ className: "active" }}>
              <Icon name="layers" />
              <span>Decks</span>
            </Link>
          </nav>
        </div>
      </CollectionProvider>
    </CardIndexProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
});
