import clsx from "clsx";
import { MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, StackedList, StackedListFlexRow, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import { ConditionBadge, FinishBadge, SignedBadge } from "src/components/card-attribute-badge";
import { CardFlipButton } from "src/components/card-flip-button";
import { CardmarketLink } from "src/components/cardmarket-link";
import { CardTagMarkers } from "src/components/card-tag-markers";
import { CardThumbnail } from "src/components/card-thumbnail";
import { unitPrice } from "src/components/card-view";
import { useCardLabels } from "src/components/card-labels";
import { CONTEXT_MENU_TARGET, contextMenuTrigger } from "src/components/context-menu";
import { MarketPrice } from "src/components/market-price";
import type { CardViewProps } from "src/components/card-view";
import { usePreloadImages } from "src/utils/use-preload-image";
import { artworkOf } from "src/utils/card-artwork";
import { useFlippedCards } from "src/utils/use-flipped-cards";

/**
 * The roomy list: artwork big enough to read, and what a compact row leaves out.
 *
 * The type line and mana value are here because this is the view for going
 * through a collection one card at a time — deciding what belongs in a deck
 * rather than counting what is in a collection.
 *
 * @returns the list
 */
export function CardViewLarge({
    entries,
    onInspect,
    onChangeQuantity,
    onDelete,
    busy,
    prices = true,
    onMenu,
    tags,
    selected,
    onActivate,
}: CardViewProps) {
    const [t] = useTranslation("collection");
    const labels = useCardLabels();
    const { isFlipped, toggle } = useFlippedCards();
    usePreloadImages(entries.map((entry) => artworkOf(entry.card, "back").image));

    return (
        <StackedList>
            {entries.map((entry) => {
                const card = entry.card;
                const price = unitPrice(entry);
                const back = artworkOf(card, "back");
                const showBack = back.image !== null && isFlipped(entry.uuid);
                const artwork = showBack ? back : artworkOf(card, "front");

                // Wraps on a phone: the controls take a line of their own below
                // the card rather than squeezing the name into a few characters.
                // Hiding them instead would have put deleting a stack out of
                // reach on mobile — the dialog cannot do it.
                return (
                    <StackedListFlexRow
                        key={entry.uuid}
                        onMouseEnter={() => onActivate?.(entry)}
                        className={clsx(
                            "flex-wrap gap-x-5 gap-y-3 py-4",
                            selected === entry.uuid && "bg-(--color-brand-500)/5",
                            CONTEXT_MENU_TARGET,
                        )}
                        {...(onMenu === undefined ? {} : contextMenuTrigger((at) => onMenu(entry, at)))}
                    >
                        {/* The flip chip sits beside the button rather than in
                            it: the artwork is what opens the card, and a button
                            inside a button is not markup a browser agrees on. */}
                        <div className={"relative shrink-0"}>
                            <button
                                type={"button"}
                                aria-label={t("accessibility.inspect-card", {
                                    name: card?.name ?? t("label.unknown-printing"),
                                })}
                                onClick={() => onInspect(entry)}
                                className={"block transition hover:opacity-80"}
                            >
                                <CardThumbnail
                                    name={card?.name ?? ""}
                                    image={artwork.image}
                                    finish={entry.finish}
                                    className={"w-28 rounded-lg sm:w-32"}
                                />
                            </button>
                            {back.image !== null && (
                                <CardFlipButton
                                    flipped={showBack}
                                    onFlip={() => toggle(entry.uuid)}
                                    className={"absolute right-1.5 bottom-1.5"}
                                />
                            )}
                        </div>

                        <div className={"flex min-w-0 flex-1 flex-col gap-2"}>
                            <button type={"button"} onClick={() => onInspect(entry)} className={"min-w-0 text-left"}>
                                <Strong className={"block truncate text-base hover:underline"}>
                                    {card?.name ?? t("label.unknown-printing")}
                                </Strong>
                            </button>

                            {card != null && (
                                <>
                                    <Text className={"truncate text-xs"}>{card.type_line}</Text>
                                    <Text className={"text-xs"}>
                                        {card.set_name} · {card.set_code} #{card.collector_number}
                                    </Text>
                                </>
                            )}

                            <div className={"flex flex-wrap items-center gap-2 pt-1"}>
                                <ConditionBadge condition={entry.condition} />
                                <FinishBadge finish={entry.finish} />
                                <SignedBadge signed={entry.signed} />
                                {card != null && <Badge color={"zinc"}>{labels.rarity(card.rarity)}</Badge>}
                                {prices && price !== null && (
                                    <Badge color={"green"}>
                                        <MarketPrice value={price * entry.quantity} lang={card?.lang} />
                                        {entry.quantity > 1 && (
                                            <span className={"opacity-70"}>
                                                {" "}
                                                (<MarketPrice value={price} lang={card?.lang} /> {t("label.each")})
                                            </span>
                                        )}
                                    </Badge>
                                )}
                                <CardmarketLink card={card} finish={entry.finish} />
                                <CardTagMarkers on={entry.tags} tags={tags} />
                            </div>
                        </div>

                        {/* One row of controls, as in the compact list. Stacked
                            over two lines the delete button ended up floating
                            under the counter with nothing to line up against. */}
                        <div className={"flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto"}>
                            {onChangeQuantity === undefined ? (
                                <Strong className={"tabular-nums"}>{`×${entry.quantity}`}</Strong>
                            ) : (
                                <>
                                    <Button
                                        plain
                                        aria-label={t("accessibility.decrease-quantity")}
                                        onClick={() => onChangeQuantity(entry, entry.quantity - 1)}
                                    >
                                        <MinusIcon className={"size-4"} />
                                    </Button>
                                    <Strong className={"w-8 text-center tabular-nums"}>{entry.quantity}</Strong>
                                    <Button
                                        plain
                                        aria-label={t("accessibility.increase-quantity")}
                                        onClick={() => onChangeQuantity(entry, entry.quantity + 1)}
                                    >
                                        <PlusIcon className={"size-4"} />
                                    </Button>
                                </>
                            )}
                            {onDelete !== undefined && (
                                <Button
                                    plain
                                    disabled={busy === entry.uuid}
                                    aria-label={t("accessibility.delete-entry")}
                                    onClick={() => onDelete(entry)}
                                >
                                    <TrashIcon className={"size-5"} />
                                </Button>
                            )}
                        </div>
                    </StackedListFlexRow>
                );
            })}
        </StackedList>
    );
}
