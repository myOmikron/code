import {
    Button,
    Description,
    Field,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { UUID } from "src/api/api";
import type { CardFinish, CollectionEntryResponse } from "src/api/generated";
import { CardDetailDialog } from "src/components/card-detail-dialog";
import { CONDITION_ORDER, FINISH_ORDER, conditionLabel, finishLabel } from "src/components/card-attribute-badge";
import type { CardmarketCard } from "src/utils/cardmarket";
import type { EntryEdit } from "src/utils/use-entry-mutations";
import type { Printing } from "src/utils/scryfall";

/** Scryfall's spelling of a finish, per the enum the backend stores */
const FINISH_ON_SCRYFALL: Record<CardFinish, string> = {
    Nonfoil: "nonfoil",
    Foil: "foil",
    Etched: "etched",
};

/**
 * The properties for {@link CollectionEntryDialog}
 */
export type CollectionEntryDialogProps = {
    /** The stack being looked at, or `null` to keep the dialog closed */
    entry: CollectionEntryResponse | null;
    /** The card the stack holds, as far as it has been resolved */
    printing: Printing | null;
    /**
     * The same card as the listing carried it, for the Cardmarket link.
     *
     * The listing knows the product path and the printing's language, which
     * Scryfall's card object does not carry.
     */
    card?: CardmarketCard | null;
    /** The collection the stack is filed in */
    collectionUuid: UUID;
    /**
     * A stack of the same printing, condition and finish, if there is one.
     *
     * Offering to combine them only makes sense when there is something to
     * combine with, and the page is the only place that knows.
     */
    mergeableWith?: CollectionEntryResponse | null;
    /** Records an edit against the optimistic store */
    onEdit: (edit: EntryEdit) => void;
    /**
     * Writes everything edited but not sent yet.
     *
     * Splitting and merging are decided server-side, from the stacks as the
     * server has them. Anything still held locally has to land first — a merge
     * deletes a row, and an edit arriving afterwards would be addressed to a
     * stack that no longer exists.
     */
    flushEdits: () => Promise<void>;
    /** Called after a split or merge, which change which stacks exist */
    onStructureChanged: () => Promise<void> | void;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * One stack, editable: how many, in what shape, what it cost and when it arrived.
 *
 * Condition, finish and count are written optimistically through `onEdit` —
 * they are the fields people flip back and forth, and waiting on a round trip
 * for each makes that miserable. Splitting and merging go straight to the
 * server instead: they change *which* stacks exist, which the list cannot
 * predict, so the loader has to run again either way.
 *
 * @returns the dialog
 */
export function CollectionEntryDialog({
    entry,
    printing,
    card = null,
    collectionUuid,
    mergeableWith = null,
    onEdit,
    flushEdits,
    onStructureChanged,
    onClose,
}: CollectionEntryDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();

    // The price is held as text, not as a number: a half-typed "12," is not a
    // number yet, and re-formatting it on every keystroke fights the cursor.
    const [price, setPrice] = useState("");
    const [busy, setBusy] = useState(false);
    const [splitting, setSplitting] = useState("");

    useEffect(() => {
        setPrice(entry?.purchase_price_cents != null ? (entry.purchase_price_cents / 100).toFixed(2) : "");
        setSplitting("");
    }, [entry]);

    if (entry === null) return <CardDetailDialog printing={null} onClose={onClose} />;

    // Bound once, because the handlers below are closures: typescript cannot
    // carry the null check above into them, and re-checking in each would be
    // noise for a case that cannot happen.
    const stack = entry;

    // Only the finishes this printing was actually produced in. Recording an
    // etched copy of a card that was never etched is not a state the collection
    // should be able to reach. The one it already carries stays offered
    // regardless, so a row that predates this cannot become un-saveable.
    const available = FINISH_ORDER.filter(
        (finish) => finish === entry.finish || (printing?.finishes ?? []).includes(FINISH_ON_SCRYFALL[finish]),
    );

    /**
     * Reads the typed price back into cents, or `null` when the field is empty
     *
     * @returns the price in cents, `null` to clear it, or `undefined` when it is not a number
     */
    function priceInCents(): number | null | undefined {
        const trimmed = price.trim();
        if (trimmed === "") return null;
        const parsed = Number(trimmed.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) return undefined;
        return Math.round(parsed * 100);
    }

    /**
     * Writes the typed price, leaving the field alone when it is not a number
     */
    function commitPrice() {
        const cents = priceInCents();
        if (cents === undefined) {
            notify.error(t("toast.invalid-price"));
            return;
        }
        if (cents === stack.purchase_price_cents) return;
        onEdit({ purchase_price_cents: cents });
    }

    /**
     * Moves the typed number of copies out of this stack into a new one
     */
    async function split() {
        const quantity = Number(splitting);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity >= stack.quantity) {
            notify.error(t("toast.invalid-split"));
            return;
        }

        setBusy(true);
        try {
            await flushEdits();
            await Api.collections.entries.split(collectionUuid, stack.uuid, { quantity });
            notify.success(t("toast.entry-split"));
            await onStructureChanged();
            onClose();
        } finally {
            setBusy(false);
        }
    }

    /**
     * Folds this stack together with the identical one next to it
     */
    async function merge() {
        if (mergeableWith === null) return;

        setBusy(true);
        try {
            await flushEdits();
            await Api.collections.entries.merge(collectionUuid, [stack.uuid, mergeableWith.uuid]);
            notify.success(t("toast.entries-merged"));
            await onStructureChanged();
            onClose();
        } finally {
            setBusy(false);
        }
    }

    return (
        <CardDetailDialog
            printing={printing}
            market={card}
            finish={stack.finish}
            onClose={onClose}
            actions={
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            }
        >
            <div className={"flex flex-col gap-5"}>
                <div className={"grid gap-4 sm:grid-cols-2"}>
                    <Field>
                        <Label>{t("label.quantity")}</Label>
                        <Input
                            type={"number"}
                            min={1}
                            value={entry.quantity}
                            onChange={(event) => {
                                const quantity = Number(event.target.value);
                                if (Number.isInteger(quantity) && quantity >= 1) onEdit({ quantity });
                            }}
                        />
                    </Field>

                    <Field>
                        <Label>{t("label.condition")}</Label>
                        {/* A listbox rather than a native select: the value is
                            typed, so the grade needs no cast back out of the
                            change event. */}
                        <Listbox value={entry.condition} onChange={(condition) => onEdit({ condition })}>
                            {CONDITION_ORDER.map((condition) => (
                                <ListboxOption key={condition} value={condition}>
                                    <ListboxLabel>{conditionLabel(tg, condition)}</ListboxLabel>
                                </ListboxOption>
                            ))}
                        </Listbox>
                    </Field>

                    <Field>
                        <Label>{t("label.finish")}</Label>
                        <Listbox value={entry.finish} onChange={(finish) => onEdit({ finish })}>
                            {available.map((finish) => (
                                <ListboxOption key={finish} value={finish}>
                                    <ListboxLabel>{finishLabel(tg, finish)}</ListboxLabel>
                                </ListboxOption>
                            ))}
                        </Listbox>
                    </Field>

                    <Field>
                        <Label>{t("label.purchase-price")}</Label>
                        <Input
                            type={"text"}
                            inputMode={"decimal"}
                            value={price}
                            placeholder={"0.00"}
                            onChange={(event) => setPrice(event.target.value)}
                            onBlur={commitPrice}
                        />
                        <Description>{t("description.purchase-price")}</Description>
                    </Field>

                    <Field>
                        <Label>{t("label.acquired-at")}</Label>
                        <Input
                            type={"date"}
                            value={entry.acquired_at ?? ""}
                            onChange={(event) =>
                                onEdit({ acquired_at: event.target.value === "" ? null : event.target.value })
                            }
                        />
                    </Field>
                </div>

                <div className={"flex flex-col gap-3 border-t border-zinc-950/10 pt-5 dark:border-white/10"}>
                    <Text className={"text-xs"}>{t("description.split-entry")}</Text>
                    <div className={"flex flex-wrap items-end gap-3"}>
                        <Field className={"w-32"}>
                            <Label>{t("label.split-quantity")}</Label>
                            <Input
                                type={"number"}
                                min={1}
                                max={entry.quantity - 1}
                                value={splitting}
                                disabled={entry.quantity < 2}
                                onChange={(event) => setSplitting(event.target.value)}
                            />
                        </Field>
                        <Button
                            outline
                            disabled={busy || entry.quantity < 2 || splitting === ""}
                            onClick={() => void split()}
                        >
                            {t("button.split-entry")}
                        </Button>
                        {mergeableWith !== null && (
                            <Button outline disabled={busy} onClick={() => void merge()}>
                                {t("button.merge-entries")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </CardDetailDialog>
    );
}
