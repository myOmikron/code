import { CheckBadgeIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import type { SourcingCandidateResponse } from "src/api/generated";
import { FoilMark, conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CollectionMarker } from "src/components/collection-marker";

/**
 * The properties for {@link DeckSourcingCandidate}
 */
export type DeckSourcingCandidateProps = {
    /** The stack this tile stands for */
    candidate: SourcingCandidateResponse;
    /** Whether it is the very printing the deck lists */
    exact: boolean;
    /** Whether it counts under the switches as they are set */
    counts: boolean;
    /** How many copies taking it would move, `0` once the slot is full */
    takeable: number;
    /** Takes copies out of this stack and into the deck */
    onTake: (candidate: SourcingCandidateResponse, quantity: number) => void;
    /** Whether a write is in flight */
    busy: boolean;
};

/**
 * One printing you own, as a tile.
 *
 * Every printing of the card is shown, not just the one the list asks for: what
 * is in the binder is a fact, and hiding it behind a switch only sends people
 * shopping for cards they already have. The one the deck actually lists wears a
 * ring and says so, and anything the switches are not counting is dimmed rather
 * than dropped — it can still be taken, on purpose.
 *
 * @returns the tile
 */
export function DeckSourcingCandidate({
    candidate,
    exact,
    counts,
    takeable,
    onTake,
    busy,
}: DeckSourcingCandidateProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const card = candidate.card;

    return (
        <li
            className={clsx(
                "flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) transition",
                exact ? "ring-2 ring-(--color-brand-500)" : "ring-1 ring-zinc-950/10 dark:ring-white/10",
                !counts && "opacity-60",
            )}
        >
            <div className={"relative"}>
                <CardThumbnail
                    name={card.name}
                    image={card.image_normal ?? card.image_small ?? null}
                    thumbnail={card.image_small ?? undefined}
                    // Without this the browser assumes the tile is as wide as
                    // the window and takes the large scan for every one of them,
                    // which on a phone is fifteen full-size cards for a grid of
                    // thumbnails.
                    sizes={"(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"}
                    finish={candidate.finish}
                    className={"w-full rounded-none"}
                />
                <span
                    className={
                        "absolute top-1.5 right-1.5 rounded-(--radius-pill) bg-zinc-950/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums"
                    }
                >
                    {candidate.quantity}×
                </span>
            </div>

            <div className={"flex flex-1 flex-col gap-1.5 p-2.5"}>
                {exact && (
                    <span
                        className={
                            "flex items-center gap-1 text-xs font-semibold text-(--color-brand-600) dark:text-(--color-brand-400)"
                        }
                    >
                        <CheckBadgeIcon className={"size-4"} />
                        {t("label.exact-printing")}
                    </span>
                )}
                <span className={"flex items-center gap-1.5"}>
                    <CollectionMarker color={candidate.collection_color} icon={candidate.collection_icon} size={"sm"} />
                    <span className={"min-w-0 flex-1 truncate text-sm text-zinc-950 dark:text-white"}>
                        {candidate.collection_name}
                    </span>
                </span>
                <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                    {card.set_name} · {card.collector_number}
                </span>
                <span className={"flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"}>
                    <FoilMark finish={candidate.finish} className={"size-3.5"} />
                    <span className={"truncate"}>
                        {conditionLabel(tg, candidate.condition)} · {finishLabel(tg, candidate.finish)}
                    </span>
                </span>
                <Button
                    outline={true}
                    className={"mt-auto"}
                    disabled={busy || takeable < 1}
                    onClick={() => onTake(candidate, takeable)}
                >
                    {t("button.take-card", { count: Math.max(takeable, 1) })}
                </Button>
            </div>
        </li>
    );
}
