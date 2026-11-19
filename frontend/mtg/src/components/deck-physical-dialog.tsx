import { ArrowUturnLeftIcon, ClipboardDocumentCheckIcon, ShoppingCartIcon } from "@heroicons/react/20/solid";
import { useRouter } from "@tanstack/react-router";
import {
    Badge,
    Button,
    ConfirmDialog,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    StackedList,
    StackedListFlexRow,
    Subheading,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckSourcingResponse,
    SourcedStackResponse,
    SourcingSlotResponse,
} from "src/api/generated";
import { FoilMark } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { DeckInventoryRow } from "src/components/deck-inventory-row";
import { DeckNotOnList } from "src/components/deck-not-on-list";
import { DeckWantsDialog } from "src/components/deck-wants-dialog";
import { EXACT_MATCH, countSlot, missingCost, stacksOffTheList } from "src/utils/deck-sourcing";
import type { SourcingCount } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";
import type { DeckPhysical } from "src/utils/use-deck-physical";

/**
 * The properties for {@link DeckPhysicalDialog}
 */
export type DeckPhysicalDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Closes the dialog */
    onClose: () => void;
    /** The deck whose Physical deck it shows */
    deck: { uuid: string; name: string };
    /** Whether the reader owns the deck and acts on its Physical deck; an Editor only reads */
    owner: boolean;
    /** The Physical deck as the card list knows it */
    physical: DeckPhysical;
};

/**
 * Everything about the Physical deck that concerns the deck as a whole.
 *
 * What one card needs lives in its card menu; this holds the values, what is still to
 * buy, filling the whole list at once, the cards the list does not name and taking the
 * deck apart. Opening it turns the Physical switch on, so the card list behind it
 * shows the marks it talks about.
 *
 * @returns the dialog
 */
export function DeckPhysicalDialog({ open, onClose, deck, owner, physical }: DeckPhysicalDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const { values, deviation, setOn, on } = physical;

    useEffect(() => {
        if (open && !on) setOn?.(true);
    }, [open, on, setOn]);

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.physical-deck")}</DialogTitle>
            <DialogDescription>
                {owner ? t("description.physical-deck-dialog") : t("description.physical-deck-read-only")}
            </DialogDescription>
            <DialogBody className={"flex flex-col gap-6"}>
                {values != null && (
                    <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                        <span className={"tabular-nums"}>
                            {t("label.list-value", { value: formatCurrency(values.list_value_cents / 100) })}
                        </span>
                        {values.physical != null && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>
                                    {t("label.physical-value", {
                                        value: formatCurrency(values.physical.physical_value_cents / 100),
                                    })}
                                </span>
                            </>
                        )}
                        {values.physical != null && values.physical.proxy_replacement_cents > 0 && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>
                                    {t("label.replacement-cost", {
                                        value: formatCurrency(values.physical.proxy_replacement_cents / 100),
                                    })}
                                </span>
                            </>
                        )}
                    </Text>
                )}

                {owner ? (
                    physical.sourcing === null ? null : (
                        <OwnerSourcing deck={deck} sourcing={physical.sourcing} />
                    )
                ) : deviation === null || !deviation.has_physical_deck ? (
                    <Text>{t("description.physical-deck-nothing")}</Text>
                ) : (
                    <DeckNotOnList copies={deviation.not_on_list} />
                )}
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * The properties for {@link OwnerSourcing}
 */
type OwnerSourcingProps = {
    /** The deck whose Physical deck it acts on */
    deck: { uuid: string; name: string };
    /** Where the deck's cards lie and where the rest could come from */
    sourcing: DeckSourcingResponse;
};

/**
 * The owner's half of the dialog: what is still to buy, the cards off the list, and the
 * deck-wide moves.
 *
 * @returns the sections
 */
function OwnerSourcing({ deck, sourcing }: OwnerSourcingProps) {
    const [t] = useTranslation("collection");
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [shopping, setShopping] = useState(false);
    const [dissolving, setDissolving] = useState(false);
    const [deleting, setDeleting] = useState<SourcedStackResponse | null>(null);
    const [collections, setCollections] = useState<Array<CollectionOverviewResponse>>([]);

    const counted = sourcing.slots.map((slot) => ({
        slot,
        count: countSlot(slot, sourcing.filed, sourcing.candidates, EXACT_MATCH),
    }));
    const open = counted.filter(({ count }) => count.filed < count.needed);
    const needed = counted.reduce((sum, row) => sum + row.count.needed, 0);
    const filed = counted.reduce((sum, row) => sum + row.count.filed, 0);
    const missing = counted.reduce((sum, row) => sum + row.count.missing, 0);
    const bill = missingCost(counted);
    const wants = counted.map(({ slot, count }) => ({
        key: slot.card?.oracle_id ?? slot.printing,
        name: slot.card?.name ?? "",
        setCode: slot.card?.set_code ?? "",
        missing: count.missing,
        available: Math.min(count.available, Math.max(0, count.needed - count.filed)),
    }));
    const offList = stacksOffTheList(sourcing.filed, sourcing.slots);

    const homeless = offList.some((stack) => !stack.proxy && stack.origin == null);

    useEffect(() => {
        if (!homeless) return;
        let gone = false;
        Api.collections
            .list()
            .then((list) => {
                if (!gone) setCollections(list.filter((entry) => entry.collection.deck == null));
            })
            .catch(() => undefined);
        return () => {
            gone = true;
        };
    }, [homeless]);

    /**
     * Runs a write, then reads the deck back
     *
     * @param write the write
     */
    async function act(write: () => Promise<unknown>) {
        setBusy(true);
        try {
            await write();
            await router.invalidate();
        } finally {
            setBusy(false);
        }
    }

    /** Records everything the list asks for as being in the deck */
    function fill() {
        void act(async () => {
            const answer = await Api.decks.sourcing.fill(deck.uuid, null);
            notify.success(t("toast.deck-filled", { count: answer.filed }));
        });
    }

    /**
     * Sorts a stack off the list back into a collection, or throws its Proxies away
     *
     * @param stack the stack
     * @param target where real cards without an origin go, `null` for where they came from
     */
    function giveBack(stack: SourcedStackResponse, target: string | null) {
        void act(async () => {
            await Api.decks.sourcing.returnCards(deck.uuid, stack.uuid, stack.quantity, target);
            notify.success(
                stack.proxy
                    ? t("toast.proxies-discarded", { count: stack.quantity })
                    : t("toast.cards-returned", { count: stack.quantity }),
            );
        });
    }

    /**
     * Takes a stack out of the deck and out of the account
     *
     * @param stack the stack
     */
    async function destroy(stack: SourcedStackResponse) {
        await act(async () => {
            await Api.decks.sourcing.discard(deck.uuid, stack.uuid);
            setDeleting(null);
            notify.success(t("toast.cards-deleted", { count: stack.quantity }));
        });
    }

    return (
        <>
            <section className={"flex flex-col gap-3"}>
                <div className={"flex flex-wrap items-start justify-between gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{t("heading.sourcing")}</Subheading>
                        <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                            <span className={"tabular-nums"}>{t("label.sourced", { filed, needed })}</span>
                            {missing > 0 && (
                                <>
                                    <span aria-hidden={true}>·</span>
                                    <span className={"tabular-nums"}>
                                        {t("label.to-buy", { count: missing })}
                                        {bill > 0 && ` · ${formatCurrency(bill / 100)}`}
                                    </span>
                                </>
                            )}
                        </Text>
                    </div>
                    <div className={"flex flex-wrap items-center gap-2"}>
                        {missing > 0 && (
                            <Button outline={true} onClick={() => setShopping(true)}>
                                <ShoppingCartIcon />
                                {t("button.export-wants")}
                            </Button>
                        )}
                        {open.length > 0 && (
                            <Button outline={true} disabled={busy} onClick={fill}>
                                <ClipboardDocumentCheckIcon />
                                {t("button.fill-from-list")}
                            </Button>
                        )}
                        {sourcing.physical_deck != null && (
                            <Button outline={true} disabled={busy} onClick={() => setDissolving(true)}>
                                <ArrowUturnLeftIcon />
                                {t("button.take-apart")}
                            </Button>
                        )}
                    </div>
                </div>

                {counted.length === 0 ? (
                    <Text>{t("description.no-slots")}</Text>
                ) : open.length === 0 ? (
                    <Text>{t("description.all-sourced")}</Text>
                ) : (
                    <StackedList>
                        {open.map(({ slot, count }) => (
                            <MissingRow key={slot.uuid} slot={slot} count={count} />
                        ))}
                    </StackedList>
                )}
            </section>

            {offList.length > 0 && (
                <section className={"flex flex-col gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{t("heading.off-the-list")}</Subheading>
                        <Text>{t("description.off-the-list")}</Text>
                    </div>
                    <StackedList>
                        {offList.map((stack) => (
                            <DeckInventoryRow
                                key={stack.uuid}
                                stack={stack}
                                collections={collections}
                                onReturn={giveBack}
                                onDelete={setDeleting}
                                busy={busy}
                            />
                        ))}
                    </StackedList>
                </section>
            )}

            <DeckWantsDialog open={shopping} rows={wants} onClose={() => setShopping(false)} />

            <ConfirmDialog
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={async () => {
                    if (deleting !== null) await destroy(deleting);
                }}
                title={t("heading.delete-cards")}
                description={t("description.delete-cards", {
                    count: deleting?.quantity ?? 0,
                    name: deleting?.card?.name ?? t("label.unknown-printing"),
                })}
                confirmLabel={t("button.delete-card")}
            />

            <DeckDissolveDialog
                deck={dissolving ? deck : null}
                onClose={() => setDissolving(false)}
                onDissolved={() => router.invalidate()}
            />
        </>
    );
}

/**
 * The properties for {@link MissingRow}
 */
type MissingRowProps = {
    /** The line of the list that is short of copies */
    slot: SourcingSlotResponse;
    /** How it is counted against the Physical deck and the collections */
    count: SourcingCount;
};

/**
 * One line of the list the Physical deck is still short of, with what buying the rest costs.
 *
 * @returns the row
 */
function MissingRow({ slot, count }: MissingRowProps) {
    const [t] = useTranslation("collection");
    const card = slot.card;
    const finish = slot.foil ? "Foil" : "Nonfoil";
    const price = slot.foil ? (card?.price_eur_foil_cents ?? card?.price_eur_cents) : card?.price_eur_cents;

    return (
        <StackedListFlexRow className={"flex-wrap items-center gap-x-3 gap-y-2"}>
            <CardThumbnail
                name={card?.name ?? ""}
                image={card?.image_small ?? null}
                finish={finish}
                compact={true}
                className={"h-12 shrink-0 rounded"}
            />
            <span className={"flex min-w-0 flex-1 flex-col gap-0.5"}>
                <span className={"flex min-w-0 items-center gap-1.5"}>
                    <span className={"truncate font-medium text-zinc-950 dark:text-white"}>
                        {card?.name ?? t("label.unknown-printing")}
                    </span>
                    <FoilMark finish={finish} />
                </span>
                <span className={"truncate text-xs text-zinc-500 dark:text-zinc-400"}>
                    {card != null && `${card.set_name} · ${card.collector_number}`}
                </span>
            </span>
            <span className={"flex shrink-0 flex-wrap items-center justify-end gap-1.5"}>
                <Badge color={"zinc"}>{t("label.in-deck-of", { filed: count.filed, needed: count.needed })}</Badge>
                {count.available > 0 && (
                    <Badge color={"lime"}>{t("label.available", { count: count.available })}</Badge>
                )}
                {count.missing > 0 && (
                    <Badge color={"amber"}>
                        <ShoppingCartIcon className={"size-3.5"} />
                        {t("label.to-buy", { count: count.missing })}
                        {price != null && ` · ${formatCurrency((price * count.missing) / 100)}`}
                    </Badge>
                )}
                <CardmarketLink card={card} finish={finish} />
            </span>
        </StackedListFlexRow>
    );
}
