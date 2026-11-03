import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/16/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Need } from "src/utils/advisor-impact";
import { dimLabel } from "src/components/deck-advisor-impact-badges";

/** How many needs show before the rest fold behind a count */
const SHOWN = 6;

/**
 * The properties for {@link DeckAdvisorNeeds}
 */
export type DeckAdvisorNeedsProps = {
    /** What the deck is short of or over on, most important first */
    needs: Array<Need>;
    /** Theme id to label */
    themeLabels: Record<string, string>;
    /** The dimension the moves are filtered by */
    selected: string | null;
    /** Filters the moves by a dimension, or clears the filter */
    onSelect: (key: string | null) => void;
};

/**
 * The deck's needs as chips in the impact badges' language, each one a
 * filter for the moves that fix it.
 *
 * @returns the chip row, or nothing when the deck sits inside every target
 */
export function DeckAdvisorNeeds({ needs, themeLabels, selected, onSelect }: DeckAdvisorNeedsProps) {
    const [t] = useTranslation("advisor");
    const [all, setAll] = useState(false);
    if (needs.length === 0) return null;

    const shown = all ? needs : needs.filter((need, index) => index < SHOWN || need.dim.key === selected);
    const folded = needs.length - shown.length;

    return (
        <div className={"flex flex-wrap items-center gap-1.5"} role={"group"} aria-label={t("accessibility.needs")}>
            {shown.map((need) => {
                const Arrow = need.up ? ArrowUpIcon : ArrowDownIcon;
                const pressed = need.dim.key === selected;
                const name = dimLabel(t, need.dim, themeLabels);
                return (
                    <button
                        key={need.dim.key}
                        type={"button"}
                        aria-pressed={pressed}
                        onClick={() => onSelect(pressed ? null : need.dim.key)}
                        title={t("label.need-hover", {
                            name,
                            value: Math.round(need.dim.value * 10) / 10,
                            low: Math.round(need.dim.low * 10) / 10,
                            high: Math.round(need.dim.high * 10) / 10,
                        })}
                        className={clsx(
                            "flex items-center gap-1 rounded-(--radius-pill) px-3 py-1 text-sm/6 font-medium shadow-(--shadow-card-sm) ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)",
                            pressed
                                ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white"
                                : "bg-(--surface-card) text-zinc-950 ring-zinc-950/10 hover:ring-amber-500/50 dark:text-white dark:ring-white/10",
                        )}
                    >
                        <Arrow
                            className={clsx("size-3.5", !pressed && "text-amber-600 dark:text-amber-400")}
                            aria-hidden={"true"}
                        />
                        {name}
                    </button>
                );
            })}
            {folded > 0 && (
                <button
                    type={"button"}
                    onClick={() => setAll(true)}
                    className={
                        "rounded-(--radius-pill) px-3 py-1 text-sm/6 font-medium text-zinc-500 ring-1 ring-zinc-950/10 transition hover:text-lime-700 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-lime-300"
                    }
                >
                    {t("button.more-needs", { count: folded })}
                </button>
            )}
        </div>
    );
}
