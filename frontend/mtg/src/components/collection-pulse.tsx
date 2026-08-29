import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { CollectionOverviewResponse, RarityCountsResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";
import { ManaCost } from "src/components/mana-cost";
import { letters } from "src/utils/deck-rules";

/**
 * The rarity ladder, in the order it is read.
 *
 * The same colours the shelf's own tiles draw it in — see `collection-tile.tsx`.
 */
const RARITY_BAR: Array<{ key: keyof RarityCountsResponse; label: string; bar: string }> = [
    { key: "common", label: "label.rarity-common", bar: "bg-zinc-500" },
    { key: "uncommon", label: "label.rarity-uncommon", bar: "bg-zinc-300" },
    { key: "rare", label: "label.rarity-rare", bar: "bg-amber-400" },
    { key: "mythic", label: "label.rarity-mythic", bar: "bg-orange-600" },
    { key: "other", label: "label.rarity-special", bar: "bg-violet-400" },
];

/**
 * The properties for {@link CollectionPulse}
 */
export type CollectionPulseProps = {
    /** Every collection the reader keeps */
    collections: Array<CollectionOverviewResponse>;
};

/**
 * What the whole shelf is made of, in one panel.
 *
 * The tiles on the shelf say this per collection; the point here is the sum of
 * them — which colours the reader actually owns and how the copies sit on the
 * rarity ladder. Both are read off the overview the shelf already fetches, so
 * the panel costs no request of its own.
 *
 * @returns the panel
 */
export function CollectionPulse({ collections }: CollectionPulseProps) {
    const [t] = useTranslation("collection");

    const rarities = collections.reduce<RarityCountsResponse>(
        (sum, overview) => ({
            common: sum.common + overview.rarities.common,
            uncommon: sum.uncommon + overview.rarities.uncommon,
            rare: sum.rare + overview.rarities.rare,
            mythic: sum.mythic + overview.rarities.mythic,
            other: sum.other + overview.rarities.other,
        }),
        { common: 0, uncommon: 0, rare: 0, mythic: 0, other: 0 },
    );
    const total = RARITY_BAR.reduce((sum, segment) => sum + rarities[segment.key], 0);
    const colors = letters(collections.map((overview) => overview.colors).join(""));
    // Biggest first: a shelf is remembered by the two or three collections
    // everything is in, not by the one that holds a single card.
    const biggest = [...collections].sort((left, right) => right.cards - left.cards).slice(0, 4);

    return (
        <div
            className={
                "flex flex-col gap-5 rounded-(--radius-card) bg-(--surface-card) p-5 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 sm:p-6 dark:ring-white/10"
            }
        >
            <div className={"flex flex-wrap items-center justify-between gap-3"}>
                <h3 className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.color-identity")}</h3>
                {colors.length > 0 && <ManaCost value={colors.map((color) => `{${color}}`).join("")} />}
            </div>

            {total > 0 && (
                <div className={"flex flex-col gap-2"}>
                    <span className={"flex h-1.5 w-full gap-px overflow-hidden rounded-full"}>
                        {RARITY_BAR.map((segment) => {
                            const copies = rarities[segment.key];
                            if (copies === 0) return null;
                            return (
                                <span
                                    key={segment.key}
                                    className={clsx("block h-full", segment.bar)}
                                    style={{ width: `${(copies / total) * 100}%` }}
                                />
                            );
                        })}
                    </span>
                    <span className={"flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"}>
                        {RARITY_BAR.filter((segment) => rarities[segment.key] > 0).map((segment) => (
                            <span key={segment.key} className={"inline-flex items-center gap-1.5"}>
                                <span className={clsx("size-1.5 rounded-full", segment.bar)} />
                                {t(segment.label)}
                                <span className={"font-medium text-zinc-950 tabular-nums dark:text-white"}>
                                    {rarities[segment.key]}
                                </span>
                            </span>
                        ))}
                    </span>
                </div>
            )}

            <ul className={"flex flex-col gap-2 border-t border-zinc-950/5 pt-4 dark:border-white/10"}>
                {biggest.map((overview) => (
                    <li key={overview.collection.uuid}>
                        <Link
                            to={"/collections/$collectionUuid/cards"}
                            params={{ collectionUuid: overview.collection.uuid }}
                            className={"flex items-center gap-3 text-sm hover:underline"}
                        >
                            <CollectionMarker
                                color={overview.collection.color}
                                icon={overview.collection.icon}
                                size={"sm"}
                            />
                            <span className={"min-w-0 flex-1 truncate text-zinc-950 dark:text-white"}>
                                {overview.collection.name}
                            </span>
                            <span className={"shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400"}>
                                {overview.cards}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
