import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Diagnostics } from "src/api/graph-generated";
import type { Corridor, DeckTargets } from "src/utils/deck-targets";
import { curveCounts, curveShort, isDefault } from "src/utils/deck-targets";
import { COCKPIT_PANELS, CockpitPanel, DeckAdvisorCockpitTiles } from "src/components/deck-advisor-cockpit-tiles";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorPanel } from "src/components/deck-advisor-panel";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";
import { DeckAdvisorTypes } from "src/components/deck-advisor-types";
import { QuietButton } from "src/components/quiet-button";
import type { CardArt } from "src/utils/deck-art";
import type { ThemeLevel, ThemePrefs } from "src/utils/deck-theme-prefs";
import { loadCockpitPanel, saveCockpitPanel } from "src/utils/cockpit-panel-storage";
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
    /** Sets how much of one theme the deck should hold, or clears the opinion */
    onSetThemeLevel: (themeId: string, level: ThemeLevel | null) => void;
    /** Display names for themes the deck no longer reads as, by id */
    themeLabels?: Record<string, string>;
    /** The deck's own artwork, for the cards behind each count */
    art: Map<string, CardArt>;
};

/**
 * Refine-phase cockpit: the four shapes the advisor grades a finished deck on.
 *
 * Four tiles and one open panel: the tiles carry every panel's state (a
 * tinted tile has something to fix) and the open panel gets the whole width.
 * The curve and corridors are draggable in place, since a swap argued against
 * a target is only arguable while the target is on screen.
 *
 * @returns the cockpit
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
    onSetThemeLevel,
    themeLabels,
    art,
}: DeckAdvisorCockpitProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState<CockpitPanel>(() => loadCockpitPanel() ?? "curve");

    /**
     * Opens one panel and remembers it for the next visit
     *
     * @param panel the panel to open
     */
    function select(panel: CockpitPanel) {
        setOpen(panel);
        saveCockpitPanel(panel);
    }

    const report = analysis.data;
    const types = report?.types ?? [];
    const available = new Set<CockpitPanel>(COCKPIT_PANELS.filter((panel) => panel !== "types" || types.length > 0));
    // A panel the service did not report cannot stay open. Resolved at render
    // rather than in an effect, so the fallback and the tile row agree on the
    // same frame.
    const selected = available.has(open) ? open : "curve";

    // The panels keep the last report through a refetch; only a cockpit that
    // has never had one says so, rather than leaving a silent gap above the
    // exchanges when the analysis is slow or the graph is down.
    if (report === null) {
        return <DeckAdvisorState state={analysis.state} />;
    }

    const spells = Math.max(0, report.deck_size - report.lands);
    const curveTargets = curveCounts(targets, spells);
    // What each tile says with its tint, by the panels' own tests.
    const issues = new Set<CockpitPanel>();
    if (report.curve.some((bucket, index) => curveShort(bucket.count, curveTargets?.[index] ?? bucket.target))) {
        issues.add("curve");
    }
    if (report.buckets.some((bucket) => bucket.status === "low")) issues.add("quotas");
    if (types.some((type) => type.status === "low")) issues.add("types");

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

            <DeckAdvisorCockpitTiles selected={selected} issues={issues} available={available} onSelect={select} />

            {selected === "curve" && (
                <DeckAdvisorPanel
                    hint={
                        eminence
                            ? `${t("description.curve-legend")} ${t("description.curve-eminence")}`
                            : t("description.curve-legend")
                    }
                >
                    {/* Capped rather than stretched: seven columns across the
                        whole page are seven slabs, and the chart reads no
                        better for it. */}
                    <div className={"sm:max-w-2xl"}>
                        <DeckAdvisorCurve
                            curve={report.curve}
                            targets={curveTargets}
                            spells={spells}
                            onSet={onSetCurve}
                            onReset={onResetCurve}
                        />
                    </div>
                </DeckAdvisorPanel>
            )}

            {selected === "quotas" && (
                <DeckAdvisorPanel hint={t("description.quotas")}>
                    <DeckAdvisorQuotas
                        buckets={report.buckets}
                        custom={targets.buckets}
                        onSet={onSetCorridor}
                        onReset={onResetCorridor}
                        art={art}
                    />
                </DeckAdvisorPanel>
            )}

            {selected === "types" && (
                <DeckAdvisorPanel hint={t("description.types")}>
                    <DeckAdvisorTypes
                        types={types}
                        custom={targets.types}
                        onSet={onSetTypeCorridor}
                        onReset={onResetTypeCorridor}
                        art={art}
                        source={report.type_source}
                    />
                </DeckAdvisorPanel>
            )}

            {selected === "themes" && (
                <DeckAdvisorThemes
                    report={report}
                    prefs={themePrefs}
                    onSetLevel={onSetThemeLevel}
                    labels={themeLabels}
                />
            )}
        </div>
    );
}
