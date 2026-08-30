import { useTranslation } from "react-i18next";
import { BarDistribution } from "src/components/charts/bar-distribution";
import { ChartCard } from "src/components/charts/chart-card";
import { SharePie } from "src/components/charts/share-pie";
import type { Diagnostics } from "src/api/graph-generated";
import type { DeckStats } from "src/utils/deck-stats";
import type { DeckTargets } from "src/utils/deck-targets";
import { curveCounts } from "src/utils/deck-targets";
import { DeckAdvisorCurve } from "src/components/deck-advisor-curve";
import type { GraphQuery } from "src/utils/use-graph-query";
import { MAGIC_COLORS } from "src/components/charts/colors";

/**
 * Props for {@link DeckAdvisorCockpit}
 */
export type DeckAdvisorCockpitProps = {
    /** Diagnostics analysis for the curve panel */
    analysis: GraphQuery<Diagnostics>;
    /** Deck targets for curve configuration */
    targets: DeckTargets;
    /** Called when user adjusts curve targets */
    onSetCurve: (counts: Array<number>) => void;
    /** Called when user resets curve */
    onResetCurve: () => void;
    /** Deck statistics for types and colors */
    stats: DeckStats;
};

/**
 * Refine-phase cockpit: three compact charts for mana curve, card types, and colors.
 *
 * Shows the deck's shape so the builder can fine-tune while swapping.
 *
 * @returns the cockpit grid
 */
export function DeckAdvisorCockpit({ analysis, targets, onSetCurve, onResetCurve, stats }: DeckAdvisorCockpitProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {/* Curve panel */}
            {analysis.data !== null && (
                <ChartCard title={t("heading.curve")} height={160}>
                    <DeckAdvisorCurve
                        curve={analysis.data.curve}
                        targets={curveCounts(targets, Math.max(0, analysis.data.deck_size - analysis.data.lands))}
                        spells={Math.max(0, analysis.data.deck_size - analysis.data.lands)}
                        onSet={onSetCurve}
                        onReset={onResetCurve}
                    />
                </ChartCard>
            )}

            {/* Types panel */}
            <ChartCard title={t("heading.cockpit-types")} height={160}>
                <BarDistribution
                    data={stats.types.map((type) => ({
                        label: t(`label.bucket-${type.key.toLowerCase().replace(/[^a-z]+/g, "-")}`, {
                            defaultValue: type.key,
                        }),
                        value: type.cards,
                    }))}
                    layout="rows"
                    showValues={true}
                />
            </ChartCard>

            {/* Colors panel */}
            <ChartCard title={t("heading.cockpit-colors")} height={160}>
                <SharePie
                    data={stats.pips.map((bucket) => ({
                        label: t(`label.color-${bucket.key.toLowerCase()}`, { defaultValue: bucket.key }),
                        value: bucket.cards,
                        color: MAGIC_COLORS[bucket.key] ?? MAGIC_COLORS.colorless,
                    }))}
                    arc={true}
                />
            </ChartCard>
        </div>
    );
}
