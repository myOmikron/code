import {
    CheckCircleIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ShoppingCartIcon,
} from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Badge, Button, StackedListFlexRow, Text } from "components";
import { useTranslation } from "react-i18next";
import type { SourcedStackResponse, SourcingCandidateResponse, SourcingSlotResponse } from "src/api/generated";
import { FoilMark } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { DeckSourcingCandidate } from "src/components/deck-sourcing-candidate";
import { countSlot, fills } from "src/utils/deck-sourcing";
import type { SourcingMatch } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";

/** The widest reading of a slot: every printing, either finish */
const ANY: SourcingMatch = { exactPrinting: false, matchFinish: false };

/**
 * The properties for {@link DeckSourcingSlot}
 */
export type DeckSourcingSlotProps = {
    /** The slot of the deck list this row stands for */
    slot: SourcingSlotResponse;
    /** Everything lying in the deck's own collection */
    filed: Array<SourcedStackResponse>;
    /** Every stack elsewhere that holds one of the deck's cards */
    candidates: Array<SourcingCandidateResponse>;
    /** How strictly copies are being counted */
    match: SourcingMatch;
    /** Whether the printings under this row are unfolded */
    open: boolean;
    /** Folds this row open, and every other one shut */
    onToggle: () => void;
    /** Takes copies out of a stack and into this slot */
    onTake: (slot: SourcingSlotResponse, candidate: SourcingCandidateResponse, quantity: number) => void;
    /** Files what is still missing as bought, straight into the deck */
    onBuy: (slot: SourcingSlotResponse) => void;
    /** Whether a write is in flight for this row */
    busy: boolean;
};

/**
 * One card of the deck list, and on demand every printing of it you own.
 *
 * A commander deck is a hundred cards and a shelf holds a dozen printings of the
 * common ones, so showing every tile at once is a thousand pictures nobody asked
 * for: the page crawls and the row somebody wants is ten screens down. The row
 * itself stays one line with the numbers on it, and the printings unfold under
 * the one being worked on.
 *
 * @returns the row
 */
export function DeckSourcingSlot({
    slot,
    filed,
    candidates,
    match,
    open,
    onToggle,
    onTake,
    onBuy,
    busy,
}: DeckSourcingSlotProps) {
    const [t] = useTranslation("collection");

    // Counted under the switches, shown regardless of them: what is in the
    // binder is a fact, and the difference between the two is what the hints are
    // about.
    const count = countSlot(slot, filed, candidates, match);
    const mine = candidates.filter((candidate) => fills(slot, candidate, ANY));
    const shown = open ? [...mine].sort((left, right) => rank(slot, left, match) - rank(slot, right, match)) : [];
    const holders = new Set(mine.map((candidate) => candidate.collection)).size;

    const card = slot.card;
    const name = card?.name ?? t("label.unknown-printing");
    const price = slot.foil ? (card?.price_eur_foil_cents ?? card?.price_eur_cents) : card?.price_eur_cents;
    const done = count.filed >= count.needed;
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

    return (
        <StackedListFlexRow className={"flex-col items-stretch gap-2"}>
            <div className={"flex flex-wrap items-center gap-x-3 gap-y-2"}>
                <button
                    type={"button"}
                    aria-expanded={open}
                    onClick={onToggle}
                    className={"flex min-w-0 flex-1 items-center gap-3 text-left"}
                >
                    <Chevron className={"size-4 shrink-0 text-zinc-400 dark:text-zinc-500"} />
                    <CardThumbnail
                        name={card?.name ?? ""}
                        image={card?.image_small ?? null}
                        finish={slot.foil ? "Foil" : "Nonfoil"}
                        compact={true}
                        className={"h-12 shrink-0 rounded"}
                    />
                    <span className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                        <span className={"flex min-w-0 items-center gap-1.5"}>
                            <span className={"truncate font-medium text-zinc-950 dark:text-white"}>{name}</span>
                            <FoilMark finish={slot.foil ? "Foil" : "Nonfoil"} />
                        </span>
                        <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                            {card != null && `${card.set_name} · ${card.collector_number}`}
                            {mine.length > 0 && ` · ${t("label.in-collections", { count: holders })}`}
                        </span>
                    </span>
                </button>

                <div className={"flex shrink-0 flex-wrap items-center justify-end gap-1.5"}>
                    {/* Only once part of it is settled: a row of the list of
                        what is missing does not need to say that nothing of it
                        is there yet. */}
                    {count.filed > 0 ? (
                        <Badge color={done ? "green" : "zinc"}>
                            {done && <CheckCircleIcon className={"size-3.5"} />}
                            {t("label.in-deck-of", { filed: count.filed, needed: count.needed })}
                        </Badge>
                    ) : (
                        <Badge color={"zinc"}>{t("label.needed", { count: count.needed })}</Badge>
                    )}
                    {!done && count.available > 0 && (
                        <Badge color={"blue"}>{t("label.available", { count: count.available })}</Badge>
                    )}
                    {count.missing > 0 && (
                        <Badge color={"amber"}>
                            <ShoppingCartIcon className={"size-3.5"} />
                            {t("label.to-buy", { count: count.missing })}
                            {price != null && ` · ${formatCurrency((price * count.missing) / 100)}`}
                        </Badge>
                    )}
                    <CardmarketLink card={card} finish={slot.foil ? "Foil" : "Nonfoil"} />
                </div>
            </div>

            {open && (
                <div className={clsx("flex flex-col gap-2", "pl-7")}>
                    {/* What the switches are turning away. Saying it here beats
                        sending somebody shopping for a card that is in the next
                        collection over, in the wrong edition. */}
                    {count.otherPrinting > 0 && (
                        <Text className={"text-xs"}>
                            {t("description.other-printing-available", { count: count.otherPrinting })}
                        </Text>
                    )}
                    {count.otherFinish > 0 && (
                        <Text className={"text-xs"}>
                            {t("description.other-finish-available", { count: count.otherFinish })}
                        </Text>
                    )}

                    {count.missing > 0 && (
                        <div
                            className={
                                "flex flex-wrap items-center justify-between gap-2 rounded-(--radius-control) bg-amber-500/10 px-3 py-2"
                            }
                        >
                            <Text className={"text-xs"}>{t("description.bought-it")}</Text>
                            {/* The other way a card gets into a deck: not out of a
                                collection but off a shop's stack, which leaves it
                                with no origin to be sorted back to. */}
                            <Button outline={true} disabled={busy} onClick={() => onBuy(slot)}>
                                <CheckIcon />
                                {t("button.bought-it", { count: count.missing })}
                            </Button>
                        </div>
                    )}

                    {shown.length === 0 ? (
                        <Text className={"text-xs"}>{t("description.no-copies-owned")}</Text>
                    ) : (
                        <ul className={"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}>
                            {shown.map((candidate) => (
                                <DeckSourcingCandidate
                                    key={candidate.uuid}
                                    candidate={candidate}
                                    exact={candidate.printing === slot.printing}
                                    counts={fills(slot, candidate, match)}
                                    takeable={Math.min(candidate.quantity, Math.max(0, count.needed - count.filed))}
                                    onTake={(taken, quantity) => onTake(slot, taken, quantity)}
                                    busy={busy}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </StackedListFlexRow>
    );
}

/**
 * Where a printing stands in the row: the listed one first, then what counts
 * under the switches, then the rest
 *
 * @param slot the slot being filled
 * @param candidate the stack to place
 * @param match how strictly copies are being counted
 *
 * @returns its sort key
 */
function rank(slot: SourcingSlotResponse, candidate: SourcingCandidateResponse, match: SourcingMatch): number {
    if (candidate.printing === slot.printing) return 0;
    return fills(slot, candidate, match) ? 1 : 2;
}
