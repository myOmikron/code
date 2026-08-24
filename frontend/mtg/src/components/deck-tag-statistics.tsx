import { Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DeckTagResponse } from "src/api/generated";
import { TAG_CHART_COLORS } from "src/components/charts/colors";
import { DeckTagMarker } from "src/components/deck-tag-marker";
import type { TagStats } from "src/utils/deck-stats";
import { tagColor, TAG_COLOR_FALLBACK, TAG_ICON_FALLBACK } from "src/utils/deck-tags";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link DeckTagStatistics}
 */
export type DeckTagStatisticsProps = {
    /** What each tag holds */
    stats: Array<TagStats>;
    /** The tags that exist, for the marker and the name behind an id */
    tags: Array<DeckTagResponse>;
    /** Copies in the deck, which the shares are taken of */
    totalCards: number;
};

/**
 * What the deck's plan is made of.
 *
 * Tags are the only split that says what a card is *for*: eight ramp pieces and
 * two tutors is a statement about the deck that no count of artifacts and
 * sorceries makes. A slot carrying several tags is counted under each of them,
 * so the shares add up past the deck.
 *
 * @returns the breakdown, or nothing while the deck has no tagged card
 */
export function DeckTagStatistics({ stats, tags, totalCards }: DeckTagStatisticsProps) {
    const [t] = useTranslation("deck");

    const rows = stats.filter((row) => row.cards > 0);
    const tagged = rows.some((row) => tags.some((tag) => tag.uuid === row.key));
    if (!tagged) return null;

    const widest = Math.max(1, ...rows.map((row) => row.cards));

    return (
        <div
            className={
                "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.tag-statistics")}</h3>
            <Text className={"mt-1 text-xs"}>{t("description.tag-statistics")}</Text>

            <ul className={"mt-4 flex flex-col gap-4"}>
                {rows.map((row) => {
                    const tag = tags.find((candidate) => candidate.uuid === row.key);
                    const slug = tag === undefined ? TAG_COLOR_FALLBACK : tagColor(tag.color);

                    return (
                        <li key={row.key} className={"flex flex-col gap-1.5"}>
                            <div className={"flex items-center gap-2"}>
                                <DeckTagMarker
                                    size={"sm"}
                                    color={slug}
                                    icon={tag?.icon ?? TAG_ICON_FALLBACK}
                                    className={tag === undefined ? "opacity-60" : undefined}
                                />
                                <Strong className={"min-w-0 flex-1 truncate text-sm"}>
                                    {tag?.name ?? t("label.untagged")}
                                </Strong>
                                <Strong className={"shrink-0 text-xs tabular-nums"}>{formatCurrency(row.value)}</Strong>
                            </div>

                            <div className={"h-1.5 w-full rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                                <div
                                    className={"h-full rounded-full"}
                                    style={{
                                        width: `${(row.cards / widest) * 100}%`,
                                        backgroundColor: TAG_CHART_COLORS[slug],
                                    }}
                                />
                            </div>

                            <div
                                className={
                                    "flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
                                }
                            >
                                <span>{t("label.cards-count", { count: row.cards })}</span>
                                <span>
                                    {t("label.tag-share", {
                                        percent: totalCards === 0 ? 0 : Math.round((row.cards / totalCards) * 100),
                                    })}
                                </span>
                                <span>{t("label.tag-average-mana", { value: row.averageManaValue.toFixed(2) })}</span>
                                {row.lands > 0 && <span>{t("label.tag-lands", { count: row.lands })}</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
