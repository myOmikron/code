import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Icon } from "../components/Icon";
import { CardIndexProvider } from "../context/card-index-context";
import { CollectionProvider } from "../context/collection-context";
import { ScanScopeProvider } from "../context/scan-scope-context";

const NAV_LINK = "flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-[#777c70] no-underline lg:gap-1.5";

/** Last-resort screen for an error that escaped a route. Offers a retry rather than a dead end,
 *  because the most likely cause is a failed index load rather than broken code. */
function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="min-h-svh px-5 pt-[max(22px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))]">
      <header className="mb-6 flex min-h-[52px] items-center justify-between">
        <div>
          <p className="m-0 text-[10px] font-extrabold tracking-[1.8px] text-acid">FEHLER</p>
          <h1 className="mt-0.5 mb-0 text-[25px] leading-[1.1] tracking-[-0.65px] font-bold">Da ging etwas schief</h1>
        </div>
      </header>
      <section className="mt-5 flex gap-3 rounded-[14px] border border-acid/10 bg-acid/5 p-[15px] text-acid">
        <Icon name="spark" size={22} />
        <span className="text-[#d9ddd1]">
          <strong className="text-[10px]">{error.name}</strong>
          <p className="mt-[3px] mb-0 text-[9px] leading-[1.45] text-[#7d8375]">{error.message}</p>
        </span>
      </section>
      <div className="mx-1.5 my-4 flex gap-2.5">
        <button className="flex-1 rounded-[14px] border border-acid bg-acid px-4 py-3 text-center text-[13px] font-bold text-ink" onClick={reset}>
          Nochmal versuchen
        </button>
        <Link className="flex-1 rounded-[14px] border border-line px-4 py-3 text-center text-[13px] text-[#e9ece3] no-underline" to="/scan">
          Zum Scanner
        </Link>
      </div>
    </main>
  );
}

/** The app shell: shared state above the router outlet, and the persistent bottom navigation.
 *  Providers live here so switching tabs never restarts the index load or drops the collection.
 *  Past `lg` the phone frame is dropped and the tab bar becomes a left rail. */
function RootLayout() {
  return (
    <CardIndexProvider>
      <CollectionProvider>
        <ScanScopeProvider>
          <div className="relative mx-auto min-h-svh w-full max-w-[480px] overflow-hidden bg-ink shadow-[0_0_80px_rgba(0,0,0,.55)] md:min-h-[calc(100svh-48px)] md:rounded-[32px] md:border md:border-white/8 lg:m-0 lg:min-h-svh lg:max-w-none lg:overflow-visible lg:rounded-none lg:border-0 lg:pl-24 lg:shadow-none">
            <Outlet />
            <nav
              className="fixed bottom-0 left-1/2 z-20 grid h-[calc(78px+env(safe-area-inset-bottom))] w-[min(480px,100%)] -translate-x-1/2 grid-cols-3 border-t border-line bg-[#11120f]/92 px-[34px] pt-[9px] pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] md:bottom-6 md:w-[478px] md:rounded-b-[31px] lg:top-0 lg:bottom-auto lg:left-0 lg:h-svh lg:w-24 lg:translate-x-0 lg:grid-cols-1 lg:content-center lg:justify-items-center lg:gap-[30px] lg:rounded-none lg:border-t-0 lg:border-r lg:bg-[#0d0f0b]/55 lg:p-0 lg:backdrop-blur-[22px] lg:[grid-auto-rows:min-content]"
              aria-label="Hauptnavigation"
            >
              <Link to="/sammlung" className={NAV_LINK} activeProps={{ className: "!text-acid" }}>
                <Icon name="cards" />
                <span>Sammlung</span>
              </Link>
              {/* Points at the section, not the app root: matching is fuzzy, so the tab stays lit
                  on /scan/live as well, and the root redirect decides where /scan actually lands. */}
              <Link to="/scan" className={`${NAV_LINK} relative`} activeProps={{ className: "!text-acid" }}>
                <i className="-mt-7 grid size-[52px] rotate-45 place-items-center rounded-[17px] border-[5px] border-ink bg-acid text-[#13150f] shadow-[0_8px_24px_rgba(197,241,52,.2)] lg:mt-0">
                  <span className="-rotate-45">
                    <Icon name="scan" size={25} />
                  </span>
                </i>
                <span className="mt-0.5">Scannen</span>
              </Link>
              <Link to="/decks" className={NAV_LINK} activeProps={{ className: "!text-acid" }}>
                <Icon name="layers" />
                <span>Decks</span>
              </Link>
            </nav>
          </div>
        </ScanScopeProvider>
      </CollectionProvider>
    </CardIndexProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
});
