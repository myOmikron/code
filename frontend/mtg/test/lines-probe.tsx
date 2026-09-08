// Renders the cEDH cockpit's lines panel on the Kess fixture (the same
// `/lines` response the mockup was drawn from), so the panel's density can
// be screenshotted and measured without logging into the app. Artwork
// comes from the catalog lookup and is absent here, which is the point:
// the layout has to read from the frame alone.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { LineReportResponse } from "src/api/graph-generated";
import { ChartPanel } from "src/components/charts/chart-card";
import { DeckAdvisorLines } from "src/components/deck-advisor-lines";
import report from "./fixtures/kess-lines.json";

/** The lines panel exactly as the cockpit frames it */
function Probe() {
    return (
        <div className={"mx-auto max-w-5xl bg-(--surface-page,#f4f4f5) p-4"}>
            <ChartPanel title={"Linien"} hint={"probe"}>
                <DeckAdvisorLines report={report as unknown as LineReportResponse} />
            </ChartPanel>
        </div>
    );
}

// The card lookup needs a client; without an API behind it, it simply never resolves.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
            <Probe />
        </Suspense>
    </QueryClientProvider>,
);
