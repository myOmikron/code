import { useTranslation } from "react-i18next";
import { ChartPanel } from "src/components/charts/chart-card";
import type { Diagnostics } from "src/api/graph-generated";
import type { Corridor, DeckTargets } from "src/utils/deck-targets";
import { curveCounts } from "src/utils/deck-targets";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorTypes } from "src/components/deck-advisor-types";
import type { CardArt } from "src/utils/deck-art";
import type { GraphQuery } from "src/utils/use-graph-query";

/**
 * Props for {@link DeckAdvisorCockpit}
 */
export type DeckAdvisorCockpitProps = {
    /** Diagnostics analysis behind all three panels */
    analysis: GraphQuery<Diagnostics>;
    /** What the deck is being graded against, where the builder moved it */
    targets: DeckTargets;
    /** Called when user adjusts curve targets */
    onSetCurve: (counts: Array<number>) => void;
    /** Called when user resets curve */
    onResetCurve: () => void;
    /** Moves one role bucket's corridor */
    onSetCorridor: (bucket: string, corridor: Corridor) => void;
    /** Puts one role bucket back on the bracket's corridor */
    onResetCorridor: (bucket: string) => void;
    /** Moves one primary type's corridor */
    onSetTypeCorridor: (type: string, corridor: Corridor) => void;
    /** Puts one primary type back on the archetype's corridor */
    onResetTypeCorridor: (type: string) => void;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
};

/**
 * Refine-phase cockpit: the three shapes the advisor grades a finished deck on.
 *
 * The same panels the tune dialog holds, brought out to sit above the
 * exchanges: every number here is one the service actually uses, and the curve
 * and the role corridors are draggable in place — a swap offered against a
 * target is only arguable if the target is on screen and can be argued with.
 *
 * Card types moves too, and its corridors are the odd ones out only in where
 * they come from: measured off decks like this one rather than offered by a
 * bracket. Dragging the Land row moves the mana-source quota beside it, which
 * is the point — the three panels are three views of one decision.
 *
 * @returns the cockpit grid
 */
export function DeckAdvisorCockpit({
    analysis,
    targets,
    onSetCurve,
    onResetCurve,
    onSetCorridor,
    onResetCorridor,
    onSetTypeCorridor,
    onResetTypeCorridor,
    art,
}: DeckAdvisorCockpitProps) {
    const [t] = useTranslation("advisor");

    // The panels keep the last report through a refetch; only a cockpit that
    // has never had one says so, rather than leaving a silent gap above the
    // exchanges when the analysis is slow or the graph is down.
    if (analysis.data === null) {
        return <DeckAdvisorState state={analysis.state} />;
    }

    const report = analysis.data;
    const types = report.types ?? [];
    const spells = Math.max(0, report.deck_size - report.lands);

    return (
        // Panels rather than ChartCards: none of these is a recharts chart, and
        // ChartCard lays its child out in the 0x0 box recharts sizes charts
        // through — which collapsed the curve into nothing and spilled its
        // axis over the swaps below.
        //
        // Started rather than stretched: the three panels are three different
        // lengths, and a stretched curve is a small chart in a tall empty box.
        <div className={"grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"} aria-busy={analysis.stale}>
            <ChartPanel title={t("heading.curve")} minHeight={240}>
                <DeckAdvisorCurve
                    curve={report.curve}
                    targets={curveCounts(targets, spells)}
                    spells={spells}
                    onSet={onSetCurve}
                    onReset={onResetCurve}
                />
            </ChartPanel>

            <ChartPanel title={t("heading.quotas")} minHeight={240}>
                <DeckAdvisorQuotas
                    buckets={report.buckets}
                    custom={targets.buckets}
                    onSet={onSetCorridor}
                    onReset={onResetCorridor}
                    art={art}
                />
            </ChartPanel>

            {types.length > 0 && (
                <ChartPanel title={t("heading.types")} minHeight={240}>
                    <DeckAdvisorTypes
                        types={types}
                        custom={targets.types}
                        onSet={onSetTypeCorridor}
                        onReset={onResetTypeCorridor}
                        art={art}
                    />
                </ChartPanel>
            )}
        </div>
    );
}
