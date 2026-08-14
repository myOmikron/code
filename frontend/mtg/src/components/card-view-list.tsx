import { MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { Badge, Button, StackedList, StackedListFlexRow, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import { ConditionBadge, FinishBadge } from "src/components/card-attribute-badge";
import { CardmarketLink } from "src/components/cardmarket-link";
import { CardThumbnail } from "src/components/card-thumbnail";
import { unitPrice } from "src/components/card-view";
import type { CardViewProps } from "src/components/card-view";
import { formatCurrency } from "src/utils/format";

/**
 * The compact list: one line per stack, artwork as a stamp.
 *
 * The densest of the views that still shows a picture, and the one to scroll
 * through when the collection is already known and the question is "how many of
 * these do I have".
 *
 * @returns the list
 */
export function CardViewList({ entries, onInspect, onChangeQuantity, onDelete, busy }: CardViewProps) {
    const [t] = useTranslation("collection");

    return (
        <StackedList>
            {entries.map((entry) => {
                const card = entry.card;
                const price = unitPrice(entry);

                // Wraps on a phone: the controls take a line of their own below
                // the card rather than squeezing the name into a few characters.
                // Hiding them instead would have put deleting a stack out of
                // reach on mobile — the dialog cannot do it.
                return (
                    <StackedListFlexRow key={entry.uuid} className={"flex-wrap gap-x-4 gap-y-3"}>
                        <button
                            type={"button"}
                            aria-label={t("accessibility.inspect-card", {
                                name: card?.name ?? t("label.unknown-printing"),
                            })}
                            onClick={() => onInspect(entry)}
                            className={"shrink-0 transition hover:opacity-80"}
                        >
                            <CardThumbnail
                                name={card?.name ?? ""}
                                image={card?.image_small ?? null}
                                finish={entry.finish}
                                compact={true}
                                className={"h-16 rounded"}
                            />
                        </button>
                        <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                            <button type={"button"} onClick={() => onInspect(entry)} className={"min-w-0 text-left"}>
                                <Strong className={"block truncate hover:underline"}>
                                    {card?.name ?? t("label.unknown-printing")}
                                </Strong>
                            </button>
                            {card != null && (
                                <Text className={"text-xs"}>
                                    {card.set_name} · {card.set_code} #{card.collector_number}
                                </Text>
                            )}
                            <div className={"flex flex-wrap items-center gap-2"}>
                                <ConditionBadge condition={entry.condition} />
                                <FinishBadge finish={entry.finish} />
                                {price !== null && (
                                    <Badge color={"green"}>{formatCurrency(price * entry.quantity)}</Badge>
                                )}
                                <CardmarketLink card={card} finish={entry.finish} />
                            </div>
                        </div>
                        <div className={"flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto"}>
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
                            <Button
                                plain
                                disabled={busy === entry.uuid}
                                aria-label={t("accessibility.delete-entry")}
                                onClick={() => onDelete(entry)}
                            >
                                <TrashIcon className={"size-5"} />
                            </Button>
                        </div>
                    </StackedListFlexRow>
                );
            })}
        </StackedList>
    );
}
