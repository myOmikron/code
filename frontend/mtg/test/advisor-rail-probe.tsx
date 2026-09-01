// Renders the cockpit's panel rail with the real themes panel and three filler
// panels of realistic heights, so the mobile rail layout can be screenshotted
// and measured without logging into the app. Driven by a CDP script that
// scrolls the rail to the themes panel and captures the result.
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { Diagnostics } from "src/api/graph-generated";
import { ChartPanel } from "src/components/charts/chart-card";
import { DeckAdvisorPanelRail, RAIL_ITEM } from "src/components/deck-advisor-panel-rail";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";

// The one-time hint would still be mid-animation when the screenshot fires.
window.localStorage.setItem("probe.rail-hint", "1");

const report = {
    deck_size: 100,
    resolved: 100,
    speed: 3,
    template: "midrange",
    lands: 32,
    average_mv: 3.1,
    buckets: [],
    curve: [],
    roles: {},
    balance: [],
    penalty: 0,
    themed_cards: 44,
    themes: [
        { theme: "treasure", label: "Treasure & ritual mana", share: 0.22, cards: 18 },
        { theme: "counters", label: "+1/+1 counters", share: 0.18, cards: 14 },
        { theme: "tokens", label: "Tokens", share: 0.12, cards: 9 },
        { theme: "sacrifice", label: "Sacrifice", share: 0.1, cards: 7 },
        { theme: "card_draw", label: "Card draw", share: 0.08, cards: 5 },
        { theme: "lifegain", label: "Lifegain", share: 0.05, cards: 3 },
    ],
} as unknown as Diagnostics;

/** A stand-in for one of the other cockpit panels, at a plausible height */
function Filler({ height, title }: { height: number; title: string }) {
    return (
        <ChartPanel className={RAIL_ITEM} title={title} hint={"filler panel"} minHeight={240}>
            <div style={{ height }} className={"rounded bg-zinc-100 dark:bg-zinc-800"} />
        </ChartPanel>
    );
}

/** The rail exactly as the cockpit composes it */
function Probe() {
    return (
        // 8px, matching what the deck page really leaves below `sm`:
        // the layout's p-6 minus the deck layout's -mx-4.
        <div className={"bg-(--surface-page,#f4f4f5) p-2"}>
            <DeckAdvisorPanelRail
                hintKey={"probe.rail-hint"}
                label={"probe"}
                gridClassName={"sm:grid sm:items-start sm:gap-4 sm:grid-cols-2 lg:grid-cols-3"}
            >
                <Filler height={280} title={"Curve"} />
                <Filler height={420} title={"Quotas"} />
                <Filler height={340} title={"Types"} />
                <div className={`${RAIL_ITEM} flex flex-col lg:col-start-1 lg:row-start-2 [&>*:first-child]:grow`}>
                    <DeckAdvisorThemes
                        report={report}
                        prefs={{ pinned: [], excluded: [] }}
                        onCycle={() => {}}
                        onDefine={() => {}}
                    />
                </div>
            </DeckAdvisorPanelRail>
        </div>
    );
}

const root = document.getElementById("root");
if (root !== null) {
    createRoot(root).render(
        <Suspense fallback={null}>
            <Probe />
        </Suspense>,
    );
    document.body.dataset.status = "mounted";
}
