import { ExclamationTriangleIcon, MinusIcon, PlusIcon, TrashIcon, TrophyIcon } from "@heroicons/react/20/solid";
import { Badge, Button, StackedListFlexRow, Strong, Text } from "components";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse, DeckTagResponse, DeckZone } from "src/api/generated";
import { CardmarketLink } from "src/components/cardmarket-link";
import { CardThumbnail } from "src/components/card-thumbnail";
import { useDeckLabels } from "src/components/deck-labels";
import { ManaCost } from "src/components/mana-cost";
import type { SlotViolation } from "src/utils/deck-rules";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link DeckCardRow}
 */
export type DeckCardRowProps = {
    /** The slot to draw */
    card: DeckCardResponse;
    /** What the format has to say about it, empty when it is fine */
    violations: Array<SlotViolation>;
    /** The tags that exist, to name the ones on this slot */
    tags: Array<DeckTagResponse>;
    /** Opens the card's dialog */
    onInspect: (card: DeckCardResponse) => void;
    /** Records a new count, left out where the deck is only being looked at */
    onChangeQuantity?: (card: DeckCardResponse, quantity: number) => void;
    /** Takes the card out, left out where the deck is only being looked at */
    onDelete?: (card: DeckCardResponse) => void;
};

/**
 * One card of a deck: what it is, how many, and what the format thinks of it.
 *
 * @returns the row
 */
export function DeckCardRow({ card, violations, tags, onInspect, onChangeQuantity, onDelete }: DeckCardRowProps) {
    const [t] = useTranslation("deck");
    const labels = useDeckLabels();

    const printing = card.card;
    const price = printing?.price_eur_cents ?? null;
    const onSlot = tags.filter((tag) => card.tags.includes(tag.uuid));

    return (
        <StackedListFlexRow className={"flex-wrap gap-x-4 gap-y-3"}>
            <button
                type={"button"}
                aria-label={t("accessibility.inspect-card", { name: printing?.name ?? t("label.unknown-printing") })}
                onClick={() => onInspect(card)}
                className={"shrink-0 transition hover:opacity-80"}
            >
                <CardThumbnail
                    name={printing?.name ?? ""}
                    image={printing?.image_normal ?? printing?.image_small ?? null}
                    finish={"Nonfoil"}
                    className={"h-20 rounded-lg sm:h-24 lg:h-28 xl:h-32"}
                />
            </button>

            <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                <button type={"button"} onClick={() => onInspect(card)} className={"min-w-0 text-left"}>
                    <Strong className={"flex min-w-0 items-center gap-2 text-base"}>
                        <span className={"truncate hover:underline"}>
                            {printing?.name ?? t("label.unknown-printing")}
                        </span>
                        {printing != null && printing.mana_cost !== "" && <ManaCost value={printing.mana_cost} />}
                    </Strong>
                </button>

                {printing != null && (
                    <Text className={"text-xs"}>
                        {printing.set_name} · {printing.set_code} #{printing.collector_number}
                    </Text>
                )}

                <div className={"flex flex-wrap items-center gap-2"}>
                    {card.zone !== "Main" && <Badge color={"zinc"}>{labels.zone(card.zone)}</Badge>}
                    {onSlot.map((tag) => (
                        <Badge key={tag.uuid} color={"blue"}>
                            {tag.name}
                        </Badge>
                    ))}
                    {printing?.game_changer === true && (
                        <span
                            className={
                                "flex items-center gap-1 rounded-(--radius-pill) bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25"
                            }
                        >
                            <TrophyIcon className={"size-3"} />
                            {t("label.game-changer")}
                        </span>
                    )}
                    {price !== null && <Badge color={"green"}>{formatCurrency((price * card.quantity) / 100)}</Badge>}
                    {violations.length > 0 && (
                        <Badge color={"amber"}>
                            <ExclamationTriangleIcon className={"size-3"} />
                            {violationLabel(t, violations[0], card.zone)}
                        </Badge>
                    )}
                    <CardmarketLink card={printing ?? null} finish={"Nonfoil"} />
                </div>
            </div>

            <div className={"flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto"}>
                {onChangeQuantity === undefined ? (
                    <Strong className={"tabular-nums"}>{`×${card.quantity}`}</Strong>
                ) : (
                    <>
                        <Button
                            plain
                            aria-label={t("accessibility.decrease-quantity")}
                            onClick={() => onChangeQuantity(card, card.quantity - 1)}
                        >
                            <MinusIcon className={"size-4"} />
                        </Button>
                        <Strong className={"w-8 text-center tabular-nums"}>{card.quantity}</Strong>
                        <Button
                            plain
                            aria-label={t("accessibility.increase-quantity")}
                            onClick={() => onChangeQuantity(card, card.quantity + 1)}
                        >
                            <PlusIcon className={"size-4"} />
                        </Button>
                    </>
                )}
                {onDelete !== undefined && (
                    <Button plain aria-label={t("accessibility.remove-card")} onClick={() => onDelete(card)}>
                        <TrashIcon className={"size-5"} />
                    </Button>
                )}
            </div>
        </StackedListFlexRow>
    );
}

/**
 * The short form of what is wrong with a card
 *
 * @param t the deck namespace's translate function
 * @param violation the first thing wrong with it
 * @param zone which zone it sits in
 *
 * @returns the label
 */
function violationLabel(
    t: (key: string, options?: Record<string, unknown>) => string,
    violation: SlotViolation | undefined,
    zone: DeckZone,
): string {
    switch (violation?.kind) {
        case "too-many":
            return t("label.violation-too-many", { copies: violation.copies, allowed: violation.allowed });
        case "color-identity":
            return t("label.violation-color-identity", { colors: violation.colors });
        case "not-legal":
        case undefined:
            return zone === "Side" ? t("label.violation-not-legal-side") : t("label.violation-not-legal");
    }
}
