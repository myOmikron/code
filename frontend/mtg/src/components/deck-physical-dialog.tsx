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
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type {
    CollectionOverviewResponse,
    DeckCardResponse,
    DeckDeviationResponse,
    DeckSourcingResponse,
    DeckValuesResponse,
    SourcedStackResponse,
} from "src/api/generated";
import { FoilMark } from "src/components/card-attribute-badge";
import { CardThumbnail } from "src/components/card-thumbnail";
import { CardmarketLink } from "src/components/cardmarket-link";
import { DeckDissolveDialog } from "src/components/deck-dissolve-dialog";
import { DeckInventoryRow } from "src/components/deck-inventory-row";
import { DeckNotOnList } from "src/components/deck-not-on-list";
import { DeckWantsDialog } from "src/components/deck-wants-dialog";
import { linesByEntry } from "src/utils/deck-deviation";
import { shortEntries, stacksOffTheList, unitPrice } from "src/utils/deck-sourcing";
import type { ShortEntry, ShortSummary } from "src/utils/deck-sourcing";
import { formatCurrency } from "src/utils/format";
import { readShelfCollections } from "src/utils/shelf-collections";
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
    /** The Deck entries of the list */
    cards: Array<DeckCardResponse>;
    /** Whether the reader owns the deck and acts on its Physical deck; an Editor only reads */
    owner: boolean;
    /** The texts from the deck's own wording: what the dialog is for, and the cards off the list */
    wording: PhysicalDialogWording;
    /** The Physical deck as the card list knows it */
    physical: DeckPhysical;
};

/** The texts {@link DeckPhysicalDialog} takes from the deck's own wording */
export type PhysicalDialogWording = {
    /** What the dialog is for, worded for the owner or for an Editor */
    description: string;
    /** Heading over the cards off the list */
    offTheListHeading: string;
    /** What to do with the cards off the list */
    offTheListDescription: string;
};

/**
 * Everything about the Physical deck that concerns the deck as a whole.
 *
 * What one card needs lives in its card menu; this holds the values, what is still to
 * buy, filling the whole list at once, the cards no Deck entry names and taking the
 * deck apart. An Editor sees the same without the actions. Opening it turns the
 * Physical switch on, so the card list behind it shows the marks it talks about.
 *
 * @returns the dialog
 */
export function DeckPhysicalDialog({ open, onClose, deck, cards, owner, wording, physical }: DeckPhysicalDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const { values, deviation, sourcing, setOn, on } = physical;

    useEffect(() => {
        if (open && !on) setOn?.(true);
    }, [open, on, setOn]);

    const summary = useMemo(
        () => shortEntries(cards, linesByEntry(deviation), sourcing?.candidates ?? []),
        [cards, deviation, sourcing],
    );

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.physical-deck")}</DialogTitle>
            <DialogDescription>{wording.description}</DialogDescription>
            <DialogBody className={"flex flex-col gap-6"}>
                {values != null && <PhysicalValues values={values} />}

                {owner ? (
                    sourcing === null ? null : (
                        <OwnerSourcing deck={deck} sourcing={sourcing} summary={summary} wording={wording} />
                    )
                ) : (
                    <EditorSourcing deviation={deviation} summary={summary} />
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
 * The properties for {@link PhysicalValues}
 */
type PhysicalValuesProps = {
    /** List value, Physical value and Proxy replacement cost */
    values: DeckValuesResponse;
};

/**
 * What the list and the Physical deck are worth, and what replacing the Proxies costs.
 *
 * @returns the values
 */
function PhysicalValues({ values }: PhysicalValuesProps) {
    const [t] = useTranslation("collection");

    return (
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
    );
}

/**
 * The properties for {@link EditorSourcing}
 */
type EditorSourcingProps = {
    /** The Deviation as the deck loader read it */
    deviation: DeckDeviationResponse | null;
    /** What the Physical deck is still short of */
    summary: ShortSummary<DeckCardResponse>;
};

/**
 * An Editor's half of the dialog: what is still to buy and the cards off the list, to read.
 *
 * @returns the sections
 */
function EditorSourcing({ deviation, summary }: EditorSourcingProps) {
    const [t] = useTranslation("collection");

    if (deviation === null || !deviation.has_physical_deck) {
        return <Text>{t("description.physical-deck-nothing")}</Text>;
    }
    return (
        <>
            <StillToSource summary={summary} />
            <DeckNotOnList copies={deviation.not_on_list} />
        </>
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
    /** What the Physical deck is still short of */
    summary: ShortSummary<DeckCardResponse>;
    /** The texts from the deck's own wording */
    wording: PhysicalDialogWording;
};

/**
 * The owner's half of the dialog: what is still to buy, the cards off the list, and the
 * deck-wide moves.
 *
 * @returns the sections
 */
function OwnerSourcing({ deck, sourcing, summary, wording }: OwnerSourcingProps) {
    const [t] = useTranslation("collection");
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [shopping, setShopping] = useState(false);
    const [dissolving, setDissolving] = useState(false);
    const [deleting, setDeleting] = useState<SourcedStackResponse | null>(null);
    const [collections, setCollections] = useState<Array<CollectionOverviewResponse>>([]);

    const wants = summary.short.map(({ entry, available, toBuy }) => ({
        key: entry.card?.oracle_id ?? entry.printing,
        name: entry.card?.name ?? "",
        missing: toBuy,
        available,
    }));
    const offList = stacksOffTheList(sourcing.filed, sourcing.slots);

    const homeless = offList.some((stack) => !stack.proxy && stack.origin == null);

    useEffect(() => {
        if (!homeless) return;
        let gone = false;
        readShelfCollections()
            .then((list) => {
                if (!gone) setCollections(list);
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
            <StillToSource
                summary={summary}
                actions={
                    <>
                        {summary.toBuy > 0 && (
                            <Button outline={true} onClick={() => setShopping(true)}>
                                <ShoppingCartIcon />
                                {t("button.export-wants")}
                            </Button>
                        )}
                        {summary.short.length > 0 && (
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
                    </>
                }
            />

            {offList.length > 0 && (
                <section className={"flex flex-col gap-3"}>
                    <div className={"flex flex-col gap-1"}>
                        <Subheading>{wording.offTheListHeading}</Subheading>
                        <Text>{wording.offTheListDescription}</Text>
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
 * The properties for {@link StillToSource}
 */
type StillToSourceProps = {
    /** What the Physical deck is still short of */
    summary: ShortSummary<DeckCardResponse>;
    /** The owner's deck-wide moves, absent for an Editor */
    actions?: ReactNode;
};

/**
 * How much of the list the Physical deck holds, and every Deck entry it is still short of
 * with what buying the rest costs.
 *
 * @returns the section
 */
function StillToSource({ summary, actions }: StillToSourceProps) {
    const [t] = useTranslation("collection");

    return (
        <section className={"flex flex-col gap-3"}>
            <div className={"flex flex-wrap items-start justify-between gap-3"}>
                <div className={"flex flex-col gap-1"}>
                    <Subheading>{t("heading.sourcing")}</Subheading>
                    <Text className={"flex flex-wrap items-center gap-x-2 gap-y-1"}>
                        <span className={"tabular-nums"}>
                            {t("label.sourced", { filed: summary.held, needed: summary.needed })}
                        </span>
                        {summary.toBuy > 0 && (
                            <>
                                <span aria-hidden={true}>·</span>
                                <span className={"tabular-nums"}>
                                    {t("label.to-buy", { count: summary.toBuy })}
                                    {summary.cost > 0 && ` · ${formatCurrency(summary.cost / 100)}`}
                                </span>
                            </>
                        )}
                    </Text>
                </div>
                {actions !== undefined && <div className={"flex flex-wrap items-center gap-2"}>{actions}</div>}
            </div>

            {summary.needed === 0 ? (
                <Text>{t("description.no-slots")}</Text>
            ) : summary.short.length === 0 ? (
                <Text>{t("description.all-sourced")}</Text>
            ) : (
                <StackedList>
                    {summary.short.map((row) => (
                        <MissingRow key={row.entry.uuid} row={row} />
                    ))}
                </StackedList>
            )}
        </section>
    );
}

/**
 * The properties for {@link MissingRow}
 */
type MissingRowProps = {
    /** The Deck entry the Physical deck is short of, with its count */
    row: ShortEntry<DeckCardResponse>;
};

/**
 * One Deck entry the Physical deck is still short of, with what buying the rest costs.
 *
 * @returns the row
 */
function MissingRow({ row }: MissingRowProps) {
    const [t] = useTranslation("collection");
    const { entry, held, wanted, available, toBuy } = row;
    const card = entry.card;
    const finish = entry.foil ? "Foil" : "Nonfoil";
    const price = unitPrice(card, entry.foil);

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
                <Badge color={"zinc"}>{t("label.in-deck-of", { filed: held, needed: wanted })}</Badge>
                {available > 0 && <Badge color={"lime"}>{t("label.available", { count: available })}</Badge>}
                {toBuy > 0 && (
                    <Badge color={"amber"}>
                        <ShoppingCartIcon className={"size-3.5"} />
                        {t("label.to-buy", { count: toBuy })}
                        {price != null && ` · ${formatCurrency((price * toBuy) / 100)}`}
                    </Badge>
                )}
                <CardmarketLink card={card} finish={finish} />
            </span>
        </StackedListFlexRow>
    );
}
