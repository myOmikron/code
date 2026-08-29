import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { Text } from "components";
import { QuietButton } from "src/components/quiet-button";
import { useTranslation } from "react-i18next";
import { Diagnostics } from "src/api/graph-generated";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";
import { Corridor, DeckTargets, curveCounts, isDefault } from "src/utils/deck-targets";
import { ThemePrefs } from "src/utils/deck-theme-prefs";
import { GraphQuery } from "src/utils/use-graph-query";

/** The surface the panels sit on, the same one {@link ChartCard} uses */
const PANEL =
    "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10";

/**
 * The properties for {@link DeckAdvisorDiagnostics}
 */
export type DeckAdvisorDiagnosticsProps = {
    /** What the analysis hook knows right now */
    analysis: GraphQuery<Diagnostics>;
    /** Copies the catalog could not identify, reported as missing */
    unknown: number;
    /** What the deck is being graded against, where the builder moved it */
    targets: DeckTargets;
    /** Moves one bucket's corridor */
    onSetCorridor: (bucket: string, corridor: Corridor) => void;
    /** Puts one bucket back on the bracket's corridor */
    onResetCorridor: (bucket: string) => void;
    /** Sets the target curve, in cards per mana value */
    onSetCurve: (counts: Array<number>) => void;
    /** Puts the curve back on the bracket's shape */
    onResetCurve: () => void;
    /** Puts every target back on the bracket's numbers */
    onResetTargets: () => void;
    /** What the advisor is told to favour and avoid */
    themePrefs: ThemePrefs;
    /** Walks one theme to its next state */
    onCycleTheme: (themeId: string) => void;
    /** Records the themes the deck is played for */
    onDefineThemes: (themes: Array<string>) => void;
    /** Display names for themes the deck no longer reads as, by id */
    themeLabels?: Record<string, string>;
};

/**
 * The diagnostics section: what the deck is measured against, and what it reads as.
 *
 * Both panels here are arguments rather than verdicts, and both can be argued
 * with in place — the quota corridors and the curve are the bracket's *offer*,
 * draggable, and every request the advisor makes is graded against whatever
 * they end up saying. The resource balance that used to sit here moved to the
 * statistics tab: it is a fact about the list rather than an opinion about it,
 * and it was the one panel nobody acted on.
 *
 * @returns the panels, or the state standing in for them
 */
export function DeckAdvisorDiagnostics({
    analysis,
    unknown,
    targets,
    onSetCorridor,
    onResetCorridor,
    onSetCurve,
    onResetCurve,
    onResetTargets,
    themePrefs,
    onCycleTheme,
    onDefineThemes,
    themeLabels,
}: DeckAdvisorDiagnosticsProps) {
    const [t] = useTranslation("advisor");

    // The previous report stays on screen through a refetch; only a section
    // that has never had one falls back to the placeholder.
    if (analysis.data === null) {
        return <DeckAdvisorState state={analysis.state} />;
    }

    const report = analysis.data;
    // What the graph could not resolve plus what the catalog itself does not
    // know — either way the analysis is missing those cards and says so.
    const missing = (report.unresolved?.length ?? 0) + unknown;
    const spells = Math.max(0, report.deck_size - report.lands);
    const custom = !isDefault(targets);

    return (
        <div className={"flex flex-col gap-6"} aria-busy={analysis.stale}>
            {missing > 0 && <Text>{t("description.partial-coverage", { amount: missing })}</Text>}
            <div className={"grid items-start gap-6 lg:grid-cols-2"}>
                <section className={PANEL}>
                    <div className={"flex items-baseline justify-between gap-3"}>
                        <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.quotas")}</h3>
                        {custom && (
                            <QuietButton onClick={onResetTargets}>
                                <ArrowUturnLeftIcon className={"size-3.5"} />
                                {t("button.reset-targets")}
                            </QuietButton>
                        )}
                    </div>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.quotas")}</p>
                    <div className={"mt-5"}>
                        <DeckAdvisorQuotas
                            buckets={report.buckets}
                            custom={targets.buckets}
                            onSet={onSetCorridor}
                            onReset={onResetCorridor}
                        />
                    </div>
                </section>

                <section className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.curve")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.curve-legend")}
                    </p>
                    <div className={"mt-4"}>
                        <DeckAdvisorCurve
                            curve={report.curve}
                            targets={curveCounts(targets, spells)}
                            spells={spells}
                            onSet={onSetCurve}
                            onReset={onResetCurve}
                        />
                    </div>
                </section>
            </div>

            <section className={PANEL}>
                <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.themes")}</h3>
                <DeckAdvisorThemes
                    report={report}
                    prefs={themePrefs}
                    onCycle={onCycleTheme}
                    onDefine={onDefineThemes}
                    labels={themeLabels}
                />
            </section>
        </div>
    );
}
