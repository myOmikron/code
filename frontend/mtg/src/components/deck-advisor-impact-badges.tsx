import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/16/solid";
import { Badge } from "components";
import { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Badge as Impact, Dim, Tone } from "src/utils/advisor-impact";

/** The badge colour of each tone */
const COLORS: Record<Tone, "lime" | "zinc" | "amber"> = { good: "lime", neutral: "zinc", warn: "amber" };

/**
 * A dimension's name in the reader's language: "Ramp", "Tokens", "Creatures", "2-drops"
 *
 * @param t the advisor namespace's translator
 * @param dim the dimension
 * @param themeLabels theme id to its label, from the analysis
 *
 * @returns the name
 */
export function dimLabel(t: TFunction, dim: Dim, themeLabels: Record<string, string>): string {
    switch (dim.kind) {
        case "theme":
            return themeLabels[dim.id] ?? dim.id.replace(/_/g, " ");
        case "bucket":
            return t(`label.bucket-${dim.id.replace(/_/g, "-")}`, { defaultValue: dim.id.replace(/_/g, " ") });
        case "type":
            return t(`label.impact-type-${dim.id.toLowerCase()}`, { defaultValue: dim.id });
        case "curve":
            return dim.id === "6" ? t("label.impact-curve-top") : t("label.impact-curve", { mv: dim.id });
    }
}

/**
 * Rounds a count for a hover line
 *
 * @param value the count
 *
 * @returns at most one decimal
 */
const round = (value: number) => String(Math.round(value * 10) / 10);

/**
 * The properties for {@link DeckAdvisorImpactBadges}
 */
export type DeckAdvisorImpactBadgesProps = {
    /** What the move changes, improvements first */
    badges: Array<Impact>;
    /** Theme id to label */
    themeLabels: Record<string, string>;
    /** How many to show before the rest fold into a count */
    max?: number;
    /** The dimension the list is filtered by, outlined where the move helps it */
    highlight?: string | null;
};

/**
 * What a move does to the deck, one badge per dimension: arrow for the
 * direction, colour for whether that is toward its target.
 *
 * @returns the badge row, or nothing for a move that changes nothing measured
 */
export function DeckAdvisorImpactBadges({ badges, themeLabels, max = 4, highlight }: DeckAdvisorImpactBadgesProps) {
    const [t] = useTranslation("advisor");
    if (badges.length === 0) return null;

    const shown = badges.slice(0, max);
    const rest = badges.slice(max);
    const name = (badge: Impact) => dimLabel(t, badge.dim, themeLabels);

    return (
        <ul className={"flex flex-wrap gap-1"}>
            {shown.map((badge) => {
                const Arrow = badge.delta > 0 ? ArrowUpIcon : ArrowDownIcon;
                const target = Number.isFinite(badge.dim.high)
                    ? t("label.impact-target", { low: round(badge.dim.low), high: round(badge.dim.high) })
                    : "";
                const hover = t("label.impact-hover", {
                    name: name(badge),
                    before: round(badge.dim.value),
                    after: round(badge.after),
                    target,
                });
                return (
                    <li key={badge.dim.key}>
                        <Badge
                            color={COLORS[badge.tone]}
                            title={hover}
                            className={
                                highlight === badge.dim.key && badge.tone === "good"
                                    ? "ring-1 ring-lime-600/50 dark:ring-lime-300/50"
                                    : undefined
                            }
                        >
                            <Arrow className={"size-3 shrink-0"} aria-hidden={"true"} />
                            <span aria-hidden={"true"}>{name(badge)}</span>
                            <span className={"sr-only"}>{hover}</span>
                        </Badge>
                    </li>
                );
            })}
            {rest.length > 0 && (
                <li>
                    <Badge
                        color={"zinc"}
                        title={rest.map((badge) => `${badge.delta > 0 ? "↑" : "↓"} ${name(badge)}`).join(", ")}
                    >
                        {t("label.impact-more", { count: rest.length })}
                    </Badge>
                </li>
            )}
        </ul>
    );
}
