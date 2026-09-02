import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { Text } from "components";
import { useTranslation } from "react-i18next";
import { ChartPanel } from "src/components/charts/chart-card";
import type { Diagnostics } from "src/api/graph-generated";
import type { Corridor, DeckTargets } from "src/utils/deck-targets";
import { curveCounts, isDefault } from "src/utils/deck-targets";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorPanelRail, RAIL_ITEM } from "src/components/deck-advisor-panel-rail";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";
import { DeckAdvisorTypes } from "src/components/deck-advisor-types";
import { QuietButton } from "src/components/quiet-button";
import type { CardArt } from "src/utils/deck-art";
import type { ThemePrefs } from "src/utils/deck-theme-prefs";
import type { GraphQuery } from "src/utils/use-graph-query";

/**
 * Props for {@link DeckAdvisorCockpit}
 */
export type DeckAdvisorCockpitProps = {
    /** Diagnostics analysis behind every panel */
    analysis: GraphQuery<Diagnostics>;
    /** Copies the catalog could not identify, reported as missing */
    unknown: number;
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
    /** Puts every target back on the bracket's numbers */
    onResetTargets: () => void;
    /** Whether an eminence discount shapes the curve, so the panel says so */
    eminence: boolean;
    /** What the advisor is told to favour and avoid */
    themePrefs: ThemePrefs;
    /** Walks one theme to its next state */
    onCycleTheme: (themeId: string) => void;
    /** Records the themes the deck is played for */
    onDefineThemes: (themes: Array<string>) => void;
    /** Display names for themes the deck no longer reads as, by id */
    themeLabels?: Record<string, string>;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
};

/**
 * Refine-phase cockpit: the four shapes the advisor grades a finished deck on.
 *
 * Every number here is one the service actually uses, and the curve and the
 * corridors are draggable in place — a swap offered against a target is only
 * arguable if the target is on screen and can be argued with. They sit above
 * the exchanges for that reason.
 *
 * Card types is the odd one out only in where its corridors come from:
 * measured off decks like this one rather than offered by a bracket. Dragging
 * the Land row moves the mana-source quota beside it, which is the point —
 * the panels are views of one decision.
 *
 * Themes is the fourth, and the only one that is not a target: it is what the
 * deck already reads as, and its chips steer what gets offered rather than
 * what gets graded. It is placed under the curve rather than beside the
 * corridors for the same reason — the first column is the deck describing
 * itself, the other two are the numbers it is held to.
 *
 * @returns the cockpit grid
 */
export function DeckAdvisorCockpit({
    analysis,
    unknown,
    targets,
    onSetCurve,
    onResetCurve,
    onSetCorridor,
    onResetCorridor,
    onSetTypeCorridor,
    onResetTypeCorridor,
    onResetTargets,
    eminence,
    themePrefs,
    onCycleTheme,
    onDefineThemes,
    themeLabels,
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
    // What the graph could not resolve plus what the catalog itself does not
    // know — either way the analysis is missing those cards and says so.
    const missing = (report.unresolved?.length ?? 0) + unknown;
    const custom = !isDefault(targets);

    return (
        <div className={"flex flex-col gap-3"} aria-busy={analysis.stale}>
            {/* Above the panels, because both lines are about all of them: what
                the analysis could not see, and whether its numbers are still
                the bracket's. Nothing is drawn when neither applies. */}
            {(missing > 0 || custom) && (
                <div className={"flex flex-wrap items-center justify-between gap-3"}>
                    {missing > 0 ? <Text>{t("description.partial-coverage", { amount: missing })}</Text> : <span />}
                    {custom && (
                        <QuietButton onClick={onResetTargets}>
                            <ArrowUturnLeftIcon className={"size-3.5"} />
                            {t("button.reset-targets")}
                        </QuietButton>
                    )}
                </div>
            )}

            {/* Panels rather than ChartCards: none of these is a recharts chart
                at the top level, and ChartCard lays its child out in the 0x0
                box recharts sizes charts through — which collapsed the curve
                into nothing and spilled its axis over the swaps below.

                Started rather than stretched: the panels are four different
                lengths, and a stretched curve is a small chart in a tall empty
                box.

                On a phone the same four panels are a rail instead — see
                DeckAdvisorPanelRail for why, and for what every child has to
                carry to be one of its stops. */}
            <DeckAdvisorPanelRail
                hintKey={"mtg.advisor.cockpit-rail-hint"}
                label={t("accessibility.cockpit-panels")}
                gridClassName={"sm:grid sm:items-start sm:gap-4 sm:grid-cols-2 lg:grid-cols-3"}
            >
                <ChartPanel
                    className={RAIL_ITEM}
                    title={t("heading.curve")}
                    hint={
                        eminence
                            ? `${t("description.curve-legend")} ${t("description.curve-eminence")}`
                            : t("description.curve-legend")
                    }
                    minHeight={240}
                >
                    <DeckAdvisorCurve
                        curve={report.curve}
                        targets={curveCounts(targets, spells)}
                        spells={spells}
                        onSet={onSetCurve}
                        onReset={onResetCurve}
                    />
                </ChartPanel>

                <ChartPanel
                    className={RAIL_ITEM}
                    title={t("heading.quotas")}
                    hint={t("description.quotas")}
                    minHeight={240}
                >
                    <DeckAdvisorQuotas
                        buckets={report.buckets}
                        custom={targets.buckets}
                        onSet={onSetCorridor}
                        onReset={onResetCorridor}
                        art={art}
                    />
                </ChartPanel>

                {types.length > 0 && (
                    <ChartPanel
                        className={RAIL_ITEM}
                        title={t("heading.types")}
                        hint={t("description.types")}
                        minHeight={240}
                    >
                        <DeckAdvisorTypes
                            types={types}
                            custom={targets.types}
                            onSet={onSetTypeCorridor}
                            onReset={onResetTypeCorridor}
                            art={art}
                            source={report.type_source}
                        />
                    </ChartPanel>
                )}

                {/* Placed rather than flowed: under the curve is where this
                    panel belongs, and a deck whose types the service did not
                    report would otherwise leave a hole and slide it up beside
                    the corridors. Narrower than three columns it simply
                    follows the others. */}
                {/* Stretched to the rail's tallest panel below `sm`, where
                    flex items share a height and a themes card floating
                    short of the others would read as a rendering fault. The
                    first child is the panel; the second is its dialog, which
                    must stay a sibling of the deferred ChartPanel body. */}
                <div className={`${RAIL_ITEM} flex flex-col lg:col-start-1 lg:row-start-2 [&>*:first-child]:grow`}>
                    <DeckAdvisorThemes
                        report={report}
                        prefs={themePrefs}
                        onCycle={onCycleTheme}
                        onDefine={onDefineThemes}
                        labels={themeLabels}
                    />
                </div>
            </DeckAdvisorPanelRail>
        </div>
    );
}
