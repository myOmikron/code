import { RectangleStackIcon } from "@heroicons/react/20/solid";
import { Link, Skeleton, Text } from "components";
import { useTranslation } from "react-i18next";
import type { WatchedCopyResponse } from "src/api/generated";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { CollectionMarker } from "src/components/collection-marker";

/**
 * The properties for {@link WatchListCopies}
 */
export type WatchListCopiesProps = {
    /** The stacks, `null` while they are still on their way */
    copies: Array<WatchedCopyResponse> | null;
};

/**
 * Which copies of a watched card you have, and where each of them is.
 *
 * Grouped by where they lie, because that is the question: a copy on a shelf is
 * something to fetch and a copy in a deck is something to think about first.
 * The shelf comes first for the same reason.
 *
 * @returns the list, or its skeleton
 */
export function WatchListCopies({ copies }: WatchListCopiesProps) {
    const [t] = useTranslation("watch-list");

    if (copies === null) {
        return (
            <div className={"flex flex-col gap-2"}>
                <Skeleton className={"h-8 w-full"} />
                <Skeleton className={"h-8 w-2/3"} />
            </div>
        );
    }

    if (copies.length === 0) {
        return <Text className={"text-xs"}>{t("description.no-copies")}</Text>;
    }

    return (
        <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
            {copies.map((copy, index) => (
                <li
                    key={`${copy.collection}-${copy.printing}-${index}`}
                    className={"flex items-center gap-2 py-2 first:pt-0 last:pb-0"}
                >
                    <CollectionMarker color={copy.collection_color} icon={copy.collection_icon} size={"sm"} />

                    <div className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                        {/* Where it is, first: the row is read to find the
                            cardboard, not to identify the card again. */}
                        <span className={"flex min-w-0 items-center gap-1"}>
                            {copy.deck == null ? (
                                <Link
                                    href={"/collections/$collectionUuid/cards"}
                                    params={{ collectionUuid: copy.collection }}
                                    className={
                                        "truncate text-xs font-medium text-zinc-950 hover:underline dark:text-white"
                                    }
                                >
                                    {copy.collection_name}
                                </Link>
                            ) : (
                                <Link
                                    href={"/decks/$deckUuid/cards"}
                                    params={{ deckUuid: copy.deck }}
                                    className={
                                        "flex min-w-0 items-center gap-1 text-xs font-medium text-zinc-950 hover:underline dark:text-white"
                                    }
                                >
                                    <RectangleStackIcon className={"size-3.5 shrink-0"} />
                                    <span className={"truncate"}>{copy.deck_name ?? copy.collection_name}</span>
                                </Link>
                            )}
                        </span>
                        <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                            {copy.set_name == null
                                ? t("label.catalog-pending")
                                : `${copy.set_name} · ${copy.collector_number} · ${(copy.lang ?? "").toUpperCase()}`}
                        </span>
                    </div>

                    <span className={"flex shrink-0 items-center gap-1"}>
                        <span className={"max-sm:hidden"}>
                            <FinishBadge finish={copy.finish} />
                        </span>
                        <ConditionBadge condition={copy.condition} />
                        <span
                            className={
                                "w-8 text-right text-xs font-semibold text-zinc-950 tabular-nums dark:text-white"
                            }
                        >
                            {copy.quantity}&times;
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
}
