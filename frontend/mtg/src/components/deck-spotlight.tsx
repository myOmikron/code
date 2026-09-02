import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { ManaCost } from "src/components/mana-cost";
import { largerScan } from "src/utils/card-artwork";
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
    commanders: Array<{
        name: string;
        image_art_crop?: string | null;
        image_normal?: string | null;
        image_small?: string | null;
    }>;
    /** The colours it plays, as the letters `WUBRG` */
    colors: Array<string>;
    /** How many cards sit in the deck proper */
    cards: number;
    /** The Commander bracket the deck claims, `null` when it claims none */
    bracket?: number | null;
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
    bracket = null,
    target = null,
    priceCents = null,
    owner = null,
    action,
}: DeckSpotlightProps) {
    // The panel is a band far wider than a card is, so a portrait scan arrives
    // here to be cropped to a quarter of its height and blown up over the full
    // width, which is what made it read soft. The illustration on its own is
    // landscape and needs none of that, so it is what the banner asks for
    // first; the card scan, one size up, is what a catalog that has not been
    // synced since falls back to.
    //
    // Even the illustration is only some 560 pixels across, and Scryfall has
    // nothing bigger: the full-size png keeps the art at much the same size.
    // Stretched over a band twice that wide on a retina screen it blurs. Left
    // at its own size it is a sliver on a wide screen, so it takes the right
    // three fifths, a good deal less stretch than the full band, and fades
    // out to the left under the wash, which covered that side anyway.
    const commander = commanders[0] ?? null;
    const scan = commander?.image_normal ?? commander?.image_small ?? null;
    const art = commander?.image_art_crop ?? (scan === null ? null : largerScan(scan));
    // The frame's top quarter is where a card keeps its art. The crop is art all
    // the way through, but the band shows only a third of its height, and
    // dead-centre cuts through what an illustration usually puts a little above
    // the middle — so it is taken from a third of the way down instead.
    const framing = commander?.image_art_crop != null ? "object-[center_35%]" : "object-[center_25%]";
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
                    className={`absolute inset-y-0 right-0 h-full w-full object-cover sm:w-3/5 ${framing} mask-l-from-45% mask-l-to-100% transition duration-700 group-hover/spotlight:scale-[1.03]`}
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
                        {bracket !== null && (
                            <span className={"rounded-(--radius-pill) bg-white/10 px-1.5 py-0.5 text-xs tabular-nums"}>
                                {`B${bracket}`}
                            </span>
                        )}
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
