import { Badge, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import { CardFlipButton } from "src/components/card-flip-button";
import { CardmarketLink } from "src/components/cardmarket-link";
import { CardThumbnail } from "src/components/card-thumbnail";
import { unitPrice } from "src/components/card-view";
import type { CardViewProps } from "src/components/card-view";
import { artworkOf } from "src/utils/card-artwork";
import { formatCurrency } from "src/utils/format";
import { useFlippedCards } from "src/utils/use-flipped-cards";

/**
 * The grid: artwork first, everything else kept to a caption.
 *
 * For finding a card by looking at it — the way one flips through a binder
 * rather than reading an inventory. Counts and prices are still there, but they
 * sit under the picture instead of competing with it, and editing happens in
 * the dialog a card opens into.
 *
 * @returns the grid
 */
export function CardViewGrid({ entries, onInspect }: CardViewProps) {
    const [t] = useTranslation("collection");
    const { isFlipped, toggle } = useFlippedCards();

    return (
        <ul
            className={
                // One column on the narrowest phones: two of them there leaves
                // each card too small to be the thing this view exists for.
                // Above that the gap and the tile padding tighten instead, which
                // buys the artwork back the width the second column costs.
                "grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8"
            }
        >
            {entries.map((entry) => {
                const card = entry.card;
                const price = unitPrice(entry);
                const back = artworkOf(card, "back");
                const showBack = back.image !== null && isFlipped(entry.uuid);
                const artwork = showBack ? back : artworkOf(card, "front");

                return (
                    <li key={entry.uuid} className={"relative"}>
                        {/* Artwork and caption sit on one surface with one
                            border around both. Floating the text under a bare
                            image left it ambiguous which card it belonged to —
                            in a grid the nearest text is as easily read as
                            belonging to the tile below. */}
                        <button
                            type={"button"}
                            onClick={() => onInspect(entry)}
                            className={
                                "group/tile block w-full rounded-xl bg-(--surface-card) p-1.5 text-left ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/20 sm:p-2 dark:ring-white/10 dark:hover:ring-white/25"
                            }
                            aria-label={t("accessibility.inspect-card", {
                                name: card?.name ?? t("label.unknown-printing"),
                            })}
                        >
                            <span className={"relative block"}>
                                <CardThumbnail
                                    name={card?.name ?? ""}
                                    image={artwork.image}
                                    finish={entry.finish}
                                    className={"w-full rounded-lg"}
                                />
                                {/* Over the artwork rather than beside it: the
                                    count is the one number wanted while looking
                                    at pictures, and a caption line for it would
                                    cost a row of height per card. */}
                                {entry.quantity > 1 && (
                                    <span
                                        className={
                                            "absolute top-2 right-2 rounded-full bg-zinc-950/85 px-2.5 py-1 text-xs font-bold text-white tabular-nums shadow-lg ring-2 ring-white/75 backdrop-blur-sm"
                                        }
                                    >
                                        ×{entry.quantity}
                                    </span>
                                )}
                            </span>

                            <span className={"mt-2 block px-0.5 pb-0.5"}>
                                <Strong className={"block truncate text-sm group-hover/tile:underline"}>
                                    {card?.name ?? t("label.unknown-printing")}
                                </Strong>
                                <span className={"mt-1.5 flex items-center justify-between gap-2"}>
                                    <Text className={"truncate text-xs"}>{card?.set_code ?? ""}</Text>
                                    {price !== null && (
                                        <Badge color={"green"}>{formatCurrency(price * entry.quantity)}</Badge>
                                    )}
                                </span>
                            </span>
                        </button>
                        {/* Beside the tile rather than inside it: the whole tile
                            is the button that opens the card, and neither an
                            anchor nor a button nested in one is markup a browser
                            agrees on. Over the artwork, opposite the count. */}
                        <span className={"absolute top-3.5 left-3.5 flex items-center gap-1 sm:top-4 sm:left-4"}>
                            <CardmarketLink card={card} finish={entry.finish} variant={"overlay"} />
                            {back.image !== null && (
                                <CardFlipButton flipped={showBack} onFlip={() => toggle(entry.uuid)} />
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
