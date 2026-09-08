// Renders the interaction grid in its two zero states: a deck whose colours
// hold none of the proactive-protection class (no alarm, a quiet note) and a
// deck that could hold some and holds none (the alarm stands).
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { InteractionGrid } from "src/api/graph-generated";
import { ChartPanel } from "src/components/charts/chart-card";
import { DeckAdvisorInteractionGrid } from "src/components/deck-advisor-interaction-grid";

/**
 * A grid with the reported cell counts and one `available` answer
 *
 * @param available what the deck's colours can play, or null
 *
 * @returns the grid
 */
function grid(available: number | null): InteractionGrid {
    const cell = (count: number) => ({ count, cards: [] });
    return {
        rows: [
            { row: "stack", cells: { free: cell(3), cheap: cell(9), held_up: cell(2) }, classes: null },
            {
                row: "proactive_protection",
                cells: { free: cell(0), cheap: cell(0), held_up: cell(0) },
                classes: null,
                available,
            },
            { row: "permanent_answer", cells: { free: cell(1), cheap: cell(6), held_up: cell(8) }, classes: null },
            { row: "class_hate", cells: { free: cell(0), cheap: cell(2), held_up: cell(2) }, classes: null },
        ],
    } as unknown as InteractionGrid;
}

/** Both zero states, side by side */
function Probe() {
    return (
        <div className={"mx-auto flex max-w-5xl flex-col gap-4 bg-(--surface-page,#f4f4f5) p-4"}>
            <ChartPanel title={"Mono-blau — nichts davon in diesen Farben"} hint={"available: 0"}>
                <DeckAdvisorInteractionGrid grid={grid(0)} />
            </ChartPanel>
            <ChartPanel title={"Weiße Identität — könnte, spielt aber keine"} hint={"available: 5"}>
                <DeckAdvisorInteractionGrid grid={grid(5)} />
            </ChartPanel>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(
    <Suspense fallback={null}>
        <Probe />
    </Suspense>,
);
