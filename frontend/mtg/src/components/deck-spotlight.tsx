import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { ManaCost } from "src/components/mana-cost";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link DeckSpotlight}
 */
export type DeckSpotlightProps = {
    /** Which of the two deck pages the panel opens */
    to: "/decks/$deckUuid/cards" | "/global/decks/$deckUuid/cards";
    /** The deck it opens */
    deckUuid: string;
    /** The line above the name, saying why this deck is the one being shown */
    eyebrow: string;
    /** Name of the deck */
    name: string;
    /** What its format is called, already translated */
    format: string;
    /** The commanders, in the order they were put in */
    commanders: Array<{ name: string; image_normal?: string | null; image_small?: string | null }>;
    /** The colours it plays, as the letters `WUBRG` */
    colors: Array<string>;
    /** How many cards sit in the deck proper */
    cards: number;
    /** How many it is built to, `null` when the format sets no number */
    target?: number | null;
    /** What those cards are worth in euro cents, left out where prices are not shown */
    priceCents?: number | null;
    /** Who built it, for a deck that is not the reader's own */
    owner?: string | null;
    /** What the button at the bottom says */
    action: string;
};

/**
 * One deck, given the whole width.
 *
 * The deck tile's own language — the commander's artwork with the dark wash
 * over it — at the size a page can lead with. That is the point: the app is
 * already full of card art laid out exactly like this, so the biggest thing on
 * the home page is a thing the reader will meet again on every shelf, rather
 * than a banner built for the front page alone.
 *
 * @returns the panel
 */
export function DeckSpotlight({
    to,
    deckUuid,
    eyebrow,
    name,
    format,
    commanders,
    colors,
    cards,
    target = null,
    priceCents = null,
    owner = null,
    action,
}: DeckSpotlightProps) {
    const art = commanders[0]?.image_normal ?? commanders[0]?.image_small ?? null;
    const filled = target === null || target === 0 ? null : Math.min(100, Math.round((cards / target) * 100));
    const done = filled !== null && cards >= target!;

    return (
        <Link
            to={to}
            params={{ deckUuid }}
            className={
                "group/spotlight relative isolate block overflow-hidden rounded-(--radius-card) bg-zinc-900 shadow-(--shadow-card-md) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card-lg) hover:ring-2 hover:ring-(--color-brand-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand-500) dark:ring-white/10"
            }
        >
            {art !== null && (
                <img
                    src={art}
                    crossOrigin={"anonymous"}
                    alt={""}
                    className={
                        "absolute inset-0 size-full object-cover object-[center_25%] transition duration-700 group-hover/spotlight:scale-[1.03]"
                    }
                />
            )}
            {/* Opaque where the words are, clear where the art is. The second
                wash lifts the bottom edge so the progress rail keeps its
                contrast over a light-coloured card. */}
            <div
                aria-hidden={true}
                className={"absolute inset-0 bg-linear-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/20"}
            />
            <div aria-hidden={true} className={"absolute inset-0 bg-linear-to-t from-zinc-950/80 to-transparent"} />

            <div className={"relative flex min-h-56 flex-col justify-end gap-4 p-6 sm:min-h-64 sm:p-8"}>
                <div className={"flex max-w-xl flex-col gap-2"}>
                    <span className={"text-xs font-medium tracking-[0.18em] text-white/60 uppercase"}>{eyebrow}</span>
                    <h3 className={"text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl"}>
                        {name}
                    </h3>
                    <p className={"flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70"}>
                        <span>{format}</span>
                        {commanders.length > 0 && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span className={"min-w-0 truncate"}>
                                    {commanders.map((commander) => commander.name).join(" & ")}
                                </span>
                            </>
                        )}
                        {owner !== null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span>{owner}</span>
                            </>
                        )}
                    </p>
                </div>

                <div className={"flex flex-wrap items-center gap-x-4 gap-y-3"}>
                    {colors.length > 0 && (
                        <span className={"rounded-(--radius-pill) bg-white/10 px-2 py-1 ring-1 ring-white/15"}>
                            <ManaCost value={colors.map((color) => `{${color}}`).join("")} />
                        </span>
                    )}

                    <span className={"flex min-w-40 flex-1 flex-col gap-1.5"}>
                        <span className={"flex items-baseline gap-1.5 text-xs text-white/70"}>
                            <span className={"font-semibold text-white tabular-nums"}>{cards}</span>
                            {target !== null && <span className={"tabular-nums"}>/ {target}</span>}
                            {priceCents !== null && priceCents > 0 && (
                                <span className={"ml-auto tabular-nums"}>{formatCurrency(priceCents / 100)}</span>
                            )}
                        </span>
                        {filled !== null && (
                            <span className={"h-1 w-full overflow-hidden rounded-full bg-white/20"}>
                                <span
                                    className={done ? "block h-full bg-(--color-success)" : "block h-full bg-white"}
                                    style={{ width: `${filled}%` }}
                                />
                            </span>
                        )}
                    </span>

                    <span
                        className={
                            "inline-flex shrink-0 items-center gap-1.5 rounded-(--radius-pill) bg-white/10 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 transition group-hover/spotlight:bg-white/20"
                        }
                    >
                        {action}
                        <ArrowRightIcon className={"size-4"} />
                    </span>
                </div>
            </div>
        </Link>
    );
}
