import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { PublicDeckResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import { formatCurrency } from "src/utils/format";
import { letters } from "src/utils/deck-rules";

/** What each colour looks like, for the decks that have no artwork to show */
const COLOR_HEX: Record<string, string> = {
    W: "#f5e9c8",
    U: "#1b6ca8",
    B: "#2b2b31",
    R: "#c8352c",
    G: "#1f7a4d",
};

/**
 * The properties for {@link PublicDeckTile}
 */
export type PublicDeckTileProps = {
    /** The deck as a stranger sees it */
    deck: PublicDeckResponse;
};

/**
 * One deck somebody put on show, led by the face at the head of it.
 *
 * The tile a search answers with. It is the owner's tile minus everything only
 * an owner has — no menu, no visibility marker, no progress against a deck size
 * nobody outside knows the house rules for — and plus the one thing a stranger
 * needs: who built it.
 *
 * @returns the tile
 */
export function PublicDeckTile({ deck }: PublicDeckTileProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const arts = deck.commanders
        .filter((commander) => commander.image_normal != null || commander.image_small != null)
        .slice(0, 2);
    const colors =
        deck.allowed_color_identity != null
            ? letters(deck.allowed_color_identity)
            : letters(deck.commanders.map((commander) => commander.color_identity).join(""));

    return (
        <li
            className={
                "group/deck relative flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-card) shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 transition hover:shadow-(--shadow-card) hover:ring-zinc-950/10 dark:ring-white/10 dark:hover:ring-white/20"
            }
        >
            <Link
                to={"/global/decks/$deckUuid/cards"}
                params={{ deckUuid: deck.uuid }}
                className={"block focus:outline-none"}
                aria-label={deck.name}
            >
                <div className={"relative h-32 overflow-hidden sm:h-36"}>
                    {arts.length > 1 ? (
                        <>
                            <span
                                className={
                                    "group/commander absolute inset-0 [clip-path:polygon(0_0,52%_0,48%_100%,0_100%)]"
                                }
                            >
                                <img
                                    src={arts[0]?.image_normal ?? arts[0]?.image_small ?? ""}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 left-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/commander:scale-105"
                                    }
                                />
                            </span>
                            <span
                                className={
                                    "group/commander absolute inset-0 [clip-path:polygon(52%_0,100%_0,100%_100%,48%_100%)]"
                                }
                            >
                                <img
                                    src={arts[1]?.image_normal ?? arts[1]?.image_small ?? ""}
                                    crossOrigin={"anonymous"}
                                    alt={""}
                                    loading={"lazy"}
                                    className={
                                        "absolute inset-y-0 right-0 h-full w-[54%] object-cover object-[center_22%] transition duration-500 group-hover/commander:scale-105"
                                    }
                                />
                            </span>
                        </>
                    ) : arts.length === 1 ? (
                        <img
                            src={arts[0]?.image_normal ?? arts[0]?.image_small ?? ""}
                            crossOrigin={"anonymous"}
                            alt={""}
                            loading={"lazy"}
                            className={
                                "h-full w-full object-cover object-[center_22%] transition duration-500 group-hover/deck:scale-105"
                            }
                        />
                    ) : (
                        <div className={"h-full w-full"} style={{ backgroundImage: colorBand(colors) }} />
                    )}

                    <div
                        className={
                            "pointer-events-none absolute inset-0 bg-linear-to-t from-zinc-950/90 via-zinc-950/35 to-zinc-950/5"
                        }
                    />

                    <div className={"pointer-events-none absolute inset-x-4 bottom-3 flex items-end gap-2"}>
                        <span className={"flex min-w-0 flex-1 flex-col"}>
                            <span className={"truncate text-base font-semibold text-white"}>{deck.name}</span>
                            <span className={"truncate text-xs text-white/75"}>
                                {deck.commanders.length > 0
                                    ? deck.commanders.map((commander) => commander.name).join(" & ")
                                    : labels.format(deck.format)}
                            </span>
                        </span>
                        {colors.length > 0 && (
                            <span className={"shrink-0 rounded-(--radius-pill) bg-zinc-950/55 px-1.5 py-1"}>
                                <ManaCost value={colors.map((color) => `{${color}}`).join("")} />
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            <div className={"flex items-center gap-2 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400"}>
                {/* The author is a link of its own rather than part of the tile's:
                    the whole tile leads to the deck, and the one thing a reader
                    wants beside it is everything else this account built. */}
                <Link
                    to={"/global/profiles/$username"}
                    params={{ username: deck.owner }}
                    className={"min-w-0 truncate font-medium text-zinc-950 hover:underline dark:text-white"}
                >
                    {deck.owner}
                </Link>
                <span aria-hidden={true}>·</span>
                <span className={"shrink-0 truncate"}>{labels.format(deck.format)}</span>
                <span className={"ml-auto flex shrink-0 items-baseline gap-1.5"}>
                    <span className={"font-semibold text-zinc-950 tabular-nums dark:text-white"}>{deck.cards}</span>
                    <span>{t("label.total-cards")}</span>
                    {deck.price_eur_cents > 0 && (
                        <span className={"tabular-nums"}>{formatCurrency(deck.price_eur_cents / 100)}</span>
                    )}
                </span>
            </div>
        </li>
    );
}

/**
 * The band a deck without artwork wears, mixed from the colours it plays
 *
 * @param colors the letters
 *
 * @returns a css gradient
 */
function colorBand(colors: Array<string>): string {
    const stops = colors.length === 0 ? ["#52525b", "#3f3f46"] : colors.map((color) => COLOR_HEX[color] ?? "#52525b");
    if (stops.length === 1) stops.push(stops[0] ?? "#52525b");
    return `linear-gradient(135deg, ${stops.join(", ")})`;
}
