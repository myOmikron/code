import { ResponsiveContainer } from "recharts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Suggestion } from "src/api/graph-generated";
import { ProfileRadar } from "src/components/charts/profile-radar";
import { batchPeaks, exclusions, fusionBonus, suggestionRadar } from "src/utils/suggestion-radar";
import { sayWhy } from "src/utils/advisor-phrase";

/**
 * The properties for {@link DeckAdvisorWhy}
 */
export type DeckAdvisorWhyProps = {
    /** The suggestion being explained */
    suggestion: Suggestion;
    /** The batch it arrived in, which each axis is normalised against */
    batch: Array<Suggestion>;
};

/**
 * Formats a fused score the way the service reports it
 *
 * @param score the raw points
 *
 * @returns the score to two decimals
 */
function points(score: number): string {
    return score.toFixed(2);
}

/**
 * Why one suggestion scored, as a shape and as numbers.
 *
 * The radar answers a question the badge row cannot: whether a card is here
 * because one channel shouted or because several agreed. That silhouette is
 * the whole retrieval argument at a glance — a lone spike is a specialist, a
 * wide shape is consensus.
 *
 * Every axis is also printed with its raw points beside it, so the honest
 * number is never further away than the shape, and so the panel is readable
 * without seeing the polygon at all. Each axis is scaled against the
 * strongest suggestion in the same batch — 1.0 is "best of these", not "good"
 * in any absolute sense — which is stated in the caption rather than left for
 * the reader to assume.
 *
 * @returns the explanation panel
 */
export function DeckAdvisorWhy({ suggestion, batch }: DeckAdvisorWhyProps) {
    const [t] = useTranslation("advisor");

    // A single instance per dialog, so recomputing the peaks here rather than
    // taking them as a prop costs nothing — the O(n) hoist in the gallery
    // (see suggestion-radar.ts) is for the ~45 tiles, not this one panel.
    const axes = suggestionRadar(suggestion, batchPeaks(batch));
    const bonus = fusionBonus(suggestion);
    const demotions = exclusions(suggestion);
    const named = (id: string) => t(`label.axis-${id.replace(/_/g, "-")}`, { defaultValue: id.replace(/_/g, " ") });

    // The axis id, not its translated label — the explanation keys are keyed
    // on the id, and the id survives a language switch.
    const [explained, setExplained] = useState<string | null>(null);
    const idOf = new Map(axes.map((axis) => [named(axis.id), axis.id]));

    return (
        <div className={"grid gap-4 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"}>
            {/* The labels sit outside the polygon, so the polygon gets 60% of
                the box and they get the rest — at 75% "Combo" and "Identity"
                were sliced off at the edges. */}
            <div className={"h-40 max-h-[45dvh] text-zinc-400 sm:h-50 dark:text-zinc-500"}>
                {/* Sized by a container like every other chart here: a bare
                    recharts chart has no dimensions of its own. */}
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    <ProfileRadar
                        data={axes.map((axis) => ({ label: named(axis.id), value: axis.value }))}
                        domain={[0, 1]}
                        radius={"60%"}
                        format={(value) => `${Math.round(value * 100)} %`}
                        onAxisHover={(label) => {
                            const id = label === null ? null : (idOf.get(label) ?? null);
                            // A second tap on the axis already explained closes it again —
                            // the only path that needs the toggle, since leaving the mouse
                            // always reports `null`.
                            setExplained((current) => (id !== null && current === id ? null : id));
                        }}
                    />
                </ResponsiveContainer>
            </div>

            <div className={"flex flex-col gap-2"}>
                <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                    {explained === null
                        ? t("description.why-scale")
                        : t(`description.axis-${explained.replace(/_/g, "-")}`)}
                </p>

                <dl className={"grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs"}>
                    {axes.map((axis) => (
                        <div key={axis.id} className={"col-span-2 grid grid-cols-subgrid"}>
                            <dt
                                tabIndex={0}
                                onMouseEnter={() => setExplained(axis.id)}
                                onMouseLeave={() => setExplained(null)}
                                onFocus={() => setExplained(axis.id)}
                                onBlur={() => setExplained(null)}
                                className={
                                    axis.score > 0
                                        ? "text-zinc-950 dark:text-white"
                                        : "text-zinc-400 dark:text-zinc-500"
                                }
                            >
                                <span
                                    className={
                                        "cursor-help underline decoration-zinc-400 decoration-dotted underline-offset-2 dark:decoration-zinc-500"
                                    }
                                >
                                    {named(axis.id)}
                                </span>
                                {axis.id === "identity" && axis.contributors !== undefined && (
                                    <span className={"text-zinc-500 dark:text-zinc-400"}>
                                        {axis.contributors.length > 0
                                            ? ` — ${axis.contributors.map((source) => source.key ?? source.channel).join(", ")}`
                                            : ""}
                                    </span>
                                )}
                            </dt>
                            <dd className={"text-right text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                {points(axis.score)}
                            </dd>
                        </div>
                    ))}

                    {bonus > 0 && (
                        <div className={"col-span-2 grid grid-cols-subgrid"}>
                            <dt className={"text-zinc-950 dark:text-white"}>{t("label.fusion-bonus")}</dt>
                            <dd className={"text-right text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                {points(bonus)}
                            </dd>
                        </div>
                    )}

                    <div
                        className={
                            "col-span-2 grid grid-cols-subgrid border-t border-zinc-950/10 pt-1 dark:border-white/10"
                        }
                    >
                        <dt className={"font-medium text-zinc-950 dark:text-white"}>{t("label.total-score")}</dt>
                        <dd className={"text-right font-medium text-zinc-950 tabular-nums dark:text-white"}>
                            {points(suggestion.score)}
                        </dd>
                    </div>
                </dl>

                {/* A radar cannot draw negative length, so what pulled the
                    score *down* is said here instead of silently missing. */}
                {demotions.length > 0 && (
                    <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("label.demotions", {
                            entries: demotions
                                .map((entry) => `${sayWhy(t, entry)} (${points(entry.score)})`)
                                .join(" · "),
                        })}
                    </p>
                )}
            </div>
        </div>
    );
}
