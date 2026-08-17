import { Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import type { Bucket } from "src/utils/deck-stats";

/**
 * The properties for {@link DeckManaSources}
 */
export type DeckManaSourcesProps = {
    /** Coloured symbols in the costs, per colour */
    pips: Array<Bucket>;
    /** Copies that can produce each colour */
    sources: Array<Bucket>;
};

/**
 * What the deck asks for against what it can make.
 *
 * The one number a mana base is judged by is not how many lands are in the
 * deck: it is whether the colours it wants are the colours it can produce. Pips
 * are what the spells demand, sources what any card can make — a rock and a
 * creature that taps for mana count exactly like a land.
 *
 * @returns the breakdown
 */
export function DeckManaSources({ pips, sources }: DeckManaSourcesProps) {
    const [t] = useTranslation("deck");

    const played = pips
        .map((bucket) => ({
            key: bucket.key,
            pips: bucket.cards,
            sources: sources.find((source) => source.key === bucket.key)?.cards ?? 0,
        }))
        .filter((row) => row.pips > 0 || row.sources > 0);

    const widest = Math.max(1, ...played.map((row) => Math.max(row.pips, row.sources)));

    if (played.length === 0) return null;

    return (
        <div
            className={
                "rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10"
            }
        >
            <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.mana-sources")}</h3>
            <Text className={"mt-1 text-xs"}>{t("description.mana-sources")}</Text>

            <div className={"mt-4 flex flex-col gap-4"}>
                {played.map((row) => (
                    <div key={row.key} className={"flex items-center gap-3"}>
                        <ManaCost value={`{${row.key}}`} className={"shrink-0"} />
                        <div className={"flex min-w-0 flex-1 flex-col gap-1"}>
                            <div className={"flex items-baseline justify-between gap-3"}>
                                <Text className={"text-xs"}>{t("label.pips-count", { count: row.pips })}</Text>
                                <Strong className={"text-xs tabular-nums"}>
                                    {t("label.sources-count", { count: row.sources })}
                                </Strong>
                            </div>
                            {/* Two bars on one baseline: what the spells ask for
                                above what the deck can make. A colour whose
                                lower bar is the shorter one is the one that
                                strands cards in hand. */}
                            <div className={"flex flex-col gap-0.5"}>
                                <div className={"h-1.5 w-full rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                                    <div
                                        className={"h-full rounded-full bg-zinc-400 dark:bg-zinc-500"}
                                        style={{ width: `${(row.pips / widest) * 100}%` }}
                                    />
                                </div>
                                <div className={"h-1.5 w-full rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                                    <div
                                        className={"h-full rounded-full bg-(--color-brand-500)"}
                                        style={{ width: `${(row.sources / widest) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
