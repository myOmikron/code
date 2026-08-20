import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "recharts";
import { ChartCard } from "src/components/charts/chart-card";
import { ProfileRadar } from "src/components/charts/profile-radar";
import { DeckAdvisorBalance } from "src/components/deck-advisor-balance";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DeckAdvisorState } from "src/components/deck-advisor-state";
import { DeckAdvisorThemes } from "src/components/deck-advisor-themes";
import { Diagnostics } from "src/api/graph-generated";
import { GraphQuery } from "src/utils/use-graph-query";
import { themeRadar } from "src/utils/suggestion-radar";
import { ThemePrefs } from "src/utils/deck-theme-prefs";
import { Text } from "components";

/** The surface the non-chart panels sit on, the same one {@link ChartCard} uses */
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
    /** What the advisor is told to favour and avoid */
    themePrefs: ThemePrefs;
    /** Walks one theme to its next state */
    onCycleTheme: (themeId: string) => void;
};

/**
 * The diagnostics section: quotas, curve, balance and themes.
 *
 * @returns the panels, or the state standing in for them
 */
export function DeckAdvisorDiagnostics({ analysis, unknown, themePrefs, onCycleTheme }: DeckAdvisorDiagnosticsProps) {
    const [t] = useTranslation("advisor");

    // The previous report stays on screen through a refetch; only a section
    // that has never had one falls back to the placeholder.
    if (analysis.data === null) {
        return <DeckAdvisorState state={analysis.state} />;
    }

    const report = analysis.data;
    // Fewer than three scoring themes is not a shape — the util returns
    // nothing and the panel says so in words instead of drawing a line.
    const themes = themeRadar(report);
    // Normalised inverse entropy: 1.0 is a deck that is entirely one thing,
    // near 0 is a bit of everything. Fetched on every analysis and, until
    // now, never shown.
    const focus =
        report.consistency === undefined
            ? t("description.themes")
            : t("description.themes-focus", { focus: Math.round(report.consistency * 100) });
    // What the graph could not resolve plus what the catalog itself does not
    // know — either way the analysis is missing those cards and says so.
    const missing = (report.unresolved?.length ?? 0) + unknown;

    return (
        <div className={"flex flex-col gap-6"} aria-busy={analysis.stale}>
            {missing > 0 && <Text>{t("description.partial-coverage", { amount: missing })}</Text>}
            <div className={"grid gap-6 lg:grid-cols-2"}>
                <div className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.quotas")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.quotas")}</p>
                    <div className={"mt-4"}>
                        <DeckAdvisorQuotas buckets={report.buckets} />
                    </div>
                </div>
                <ChartCard title={t("heading.curve")} hint={t("description.curve-legend")}>
                    <DeckAdvisorCurve curve={report.curve} />
                </ChartCard>
            </div>
            <div className={"grid items-start gap-6 lg:grid-cols-2"}>
                <div className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.balance")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.balance")}</p>
                    <div className={"mt-4 max-h-96 overflow-y-auto"}>
                        <DeckAdvisorBalance balance={report.balance} />
                    </div>
                </div>
                {/* A shape needs three axes; below that the panel says what
                    it found in words rather than drawing a line and calling
                    it a profile. */}
                <div className={PANEL}>
                    <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.themes")}</h3>
                    <p className={"mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>{focus}</p>
                    {themes.length > 0 ? (
                        <div className={"mt-2 text-zinc-400 dark:text-zinc-500"} style={{ height: 240 }}>
                            <ResponsiveContainer width={"100%"} height={"100%"}>
                                <ProfileRadar
                                    data={themes.map((theme) => ({ label: theme.label, value: theme.value }))}
                                    domain={[0, 1]}
                                    format={(value) => `${Math.round(value * 100)} %`}
                                />
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <Text className={"mt-4"}>{t("description.no-theme-signal")}</Text>
                    )}
                    <div className={"mt-3"}>
                        <DeckAdvisorThemes report={report} prefs={themePrefs} onCycle={onCycleTheme} />
                    </div>
                </div>
            </div>
        </div>
    );
}
