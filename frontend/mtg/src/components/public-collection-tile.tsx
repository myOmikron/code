import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { PublicCollectionResponse, RarityCountsResponse } from "src/api/generated";
import { CollectionIcon, CollectionMarker } from "src/components/collection-marker";
import { ManaCost } from "src/components/mana-cost";
import { COLLECTION_FILL, collectionColor } from "src/utils/collection-style";

/**
 * The bar under a collection, in the ladder's order.
 *
 * The same colours the owner's tile draws it in — see `collection-tile.tsx`.
 */
const RARITY_BAR: Array<{ key: keyof RarityCountsResponse; label: string; bar: string }> = [
    { key: "common", label: "label.rarity-common", bar: "bg-zinc-500" },
    { key: "uncommon", label: "label.rarity-uncommon", bar: "bg-zinc-300" },
    { key: "rare", label: "label.rarity-rare", bar: "bg-amber-400" },
    { key: "mythic", label: "label.rarity-mythic", bar: "bg-orange-600" },
    { key: "other", label: "label.rarity-special", bar: "bg-violet-400" },
];

/**
 * The properties for {@link PublicCollectionTile}
 */
export type PublicCollectionTileProps = {
    /** The collection as a stranger sees it */
    collection: PublicCollectionResponse;
};

/**
 * One collection somebody put on show, led by the best cards in it.
 *
 * The owner's tile minus what only an owner has: no menu, no visibility marker,
 * and no figure in money — what somebody else's cards are worth is theirs.
 *
 * @returns the tile
 */
export function PublicCollectionTile({ collection }: PublicCollectionTileProps) {
    const [t] = useTranslation("collection");

    const arts = collection.arts;
    const fill = COLLECTION_FILL[collectionColor(collection.color)];
    const colors = [...collection.colors];

    return (
        <li
            className={
                "group/collection relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/15 dark:ring-white/10 dark:hover:ring-white/25"
            }
        >
            <Link
                to={"/global/collections/$collectionUuid/cards"}
                params={{ collectionUuid: collection.uuid }}
                className={"block focus:outline-none"}
                aria-label={collection.name}
            >
                <div className={clsx("relative h-32 overflow-hidden sm:h-36", fill)}>
                    {arts.length > 1 ? (
                        <>
                            <span className={"absolute inset-0 [clip-path:polygon(0_0,52%_0,48%_100%,0_100%)]"}>
                                <img
                                    src={arts[0]}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 left-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                                    }
                                />
                            </span>
                            <span className={"absolute inset-0 [clip-path:polygon(52%_0,100%_0,100%_100%,48%_100%)]"}>
                                <img
                                    src={arts[1]}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                                    }
                                />
                            </span>
                        </>
                    ) : arts.length === 1 ? (
                        <img
                            src={arts[0]}
                            crossOrigin={"anonymous"}
                            alt={""}
                            loading={"lazy"}
                            className={
                                "h-full w-full object-cover object-[center_22%] transition duration-500 group-hover/collection:scale-105"
                            }
                        />
                    ) : (
                        <CollectionIcon
                            icon={collection.icon}
                            className={
                                "absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-[60%] text-white/25"
                            }
                        />
                    )}

                    <div
                        className={
                            "pointer-events-none absolute inset-0 bg-linear-to-t from-zinc-950/90 via-zinc-950/35 to-zinc-950/5"
                        }
                    />

                    <div className={"pointer-events-none absolute inset-x-4 bottom-3 flex items-end gap-2"}>
                        <CollectionMarker
                            color={collection.color}
                            icon={collection.icon}
                            size={"md"}
                            className={"outline-2 outline-white/40"}
                        />
                        <span className={"flex min-w-0 flex-1 flex-col"}>
                            <span className={"truncate text-base font-semibold text-white"}>{collection.name}</span>
                            {collection.description !== "" && (
                                <span className={"truncate text-xs text-white/75"}>{collection.description}</span>
                            )}
                        </span>
                        {colors.length > 0 && (
                            <span className={"shrink-0 rounded-(--radius-pill) bg-zinc-950/55 px-1.5 py-1"}>
                                <ManaCost value={colors.map((color) => `{${color}}`).join("")} />
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            <div className={"flex flex-col gap-1.5 px-4 py-3"}>
                <span className={"flex items-baseline gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                    <span className={"font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                        {collection.cards}
                    </span>
                    <span className={"truncate"}>{t("label.total-cards")}</span>
                </span>
                <span
                    className={"flex h-1 w-full gap-px overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}
                    title={RARITY_BAR.filter((segment) => collection.rarities[segment.key] > 0)
                        .map((segment) => `${t(segment.label)}: ${collection.rarities[segment.key]}`)
                        .join(" · ")}
                >
                    {RARITY_BAR.map((segment) => {
                        const copies = collection.rarities[segment.key];
                        if (copies === 0) return null;
                        return (
                            <span
                                key={segment.key}
                                className={clsx("block h-full", segment.bar)}
                                style={{ width: `${share(copies, collection.rarities)}%` }}
                            />
                        );
                    })}
                </span>
            </div>
        </li>
    );
}

/**
 * How much of the rarity bar one segment takes
 *
 * @param copies the copies in this rarity
 * @param rarities every rarity in the collection
 *
 * @returns the percentage
 */
function share(copies: number, rarities: RarityCountsResponse): number {
    const total = RARITY_BAR.reduce((sum, segment) => sum + rarities[segment.key], 0);
    return total === 0 ? 0 : (copies / total) * 100;
}
