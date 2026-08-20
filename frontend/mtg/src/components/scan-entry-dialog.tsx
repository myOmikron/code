import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
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
import {
    CONDITION_ORDER,
    FINISH_ON_SCRYFALL,
    FINISH_ORDER,
    conditionLabel,
    finishLabel,
} from "src/components/card-attribute-badge";
import { CardChooser } from "src/components/card-chooser";
import { CardImage } from "src/components/card-image";
import { PrintingPicker } from "src/components/printing-picker";
import { printingCoordinate } from "src/utils/format";
import { resolveLookups } from "src/utils/printing-catalog";
import type { ScanEntry } from "src/utils/scan-sessions";
import type { CardRecord } from "src/types";

/** The fields the dialog edits in place */
export type ScanEntryPatch = Partial<
    Pick<ScanEntry, "quantity" | "finish" | "condition" | "purchasePriceCents" | "acquiredAt">
>;

/**
 * The properties for {@link ScanEntryDialog}
 */
export type ScanEntryDialogProps = {
    /** The entry being edited, or `null` to keep the dialog closed */
    entry: ScanEntry | null;
    /** Writes a change to the entry */
    onPatch: (patch: ScanEntryPatch) => void;
    /** Corrects the entry to another card or printing */
    onReplaceCard: (card: CardRecord) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * One staged scan, editable: which printing, how many, in what shape, what it cost and when.
 *
 * Everything is written straight into the on-device session — there is no server round trip until
 * the transfer, so every change lands immediately.
 *
 * @returns the dialog
 */
export function ScanEntryDialog({ entry, onPatch, onReplaceCard, onClose }: ScanEntryDialogProps) {
    const [t] = useTranslation("session");
    const [tg] = useTranslation();

    // The price is held as text, not as a number: a half-typed "12," is not a
    // number yet, and re-formatting it on every keystroke fights the cursor.
    const [price, setPrice] = useState("");
    const [pickingPrinting, setPickingPrinting] = useState(false);
    // The finishes this printing exists in, per the catalog; `null` while unresolved or offline,
    // which offers all of them — the transfer validates again either way.
    const [finishes, setFinishes] = useState<string[] | null>(null);

    const entryId = entry?.id ?? null;
    const priceCents = entry?.purchasePriceCents ?? null;
    useEffect(() => {
        setPrice(priceCents != null ? (priceCents / 100).toFixed(2) : "");
        // Keyed on the entry's identity: re-running the reset on every patch would stomp the
        // price mid-type, so the stored cents are read without being a dependency.
    }, [entryId]);

    const card = entry?.card ?? null;
    useEffect(() => {
        setFinishes(null);
        if (card === null) return;
        let dropped = false;
        // Best effort: the entry's card id may be an index-internal face id, which `resolveLookups`
        // strips so the set and collector number place the printing instead.
        resolveLookups([
            {
                id: card.id,
                set_code: card.setCode,
                collector_number: card.collectorNumber,
                name: card.name,
                lang: card.lang,
            },
        ])
            .then(([printing]) => {
                if (!dropped && printing !== null) setFinishes(printing.finishes);
            })
            .catch(() => undefined);
        return () => {
            dropped = true;
        };
    }, [card]);

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
        if (cents === entry?.purchasePriceCents) return;
        onPatch({ purchasePriceCents: cents });
    }

    // Only the finishes this printing was actually produced in — plus the one the entry already
    // carries, so an earlier choice cannot become un-editable.
    const available = FINISH_ORDER.filter(
        (finish) => finish === entry?.finish || finishes === null || finishes.includes(FINISH_ON_SCRYFALL[finish]),
    );

    return (
        <>
            <Dialog open={entry !== null} onClose={onClose} size="2xl">
                <DialogTitle>{t("heading.edit-entry")}</DialogTitle>
                {entry !== null && (
                    <DialogBody className="flex flex-col gap-5">
                        <div className="flex gap-4">
                            <CardImage card={entry.card} className="h-[112px] w-20 shrink-0 rounded-md" />
                            <div className="min-w-0 flex-1">
                                <Text className="truncate font-semibold !text-zinc-950 dark:!text-white">
                                    {entry.card.name}
                                </Text>
                                <Text className="truncate">{entry.card.setName}</Text>
                                <Text className="truncate">{printingCoordinate(entry.card)}</Text>
                                <Button outline className="mt-3" onClick={() => setPickingPrinting(true)}>
                                    {t("button.change-printing")}
                                </Button>
                            </div>
                        </div>

                        {/* The scan's runners-up: the fastest correction when the scanner picked the
                        wrong card, offered before the full printing list. */}
                        {entry.alternatives.length > 0 && (
                            <div>
                                <Text className="mb-2">{t("description.alternatives")}</Text>
                                <CardChooser
                                    cards={[entry.card, ...entry.alternatives]}
                                    selectedId={entry.card.id}
                                    onSelect={onReplaceCard}
                                    label={t("accessibility.choose-alternative")}
                                />
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                                <Label>{t("label.quantity")}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={entry.quantity}
                                    onChange={(event) => {
                                        const quantity = Number(event.target.value);
                                        if (Number.isInteger(quantity) && quantity >= 1) onPatch({ quantity });
                                    }}
                                />
                            </Field>

                            <Field>
                                <Label>{t("label.condition")}</Label>
                                <Listbox value={entry.condition} onChange={(condition) => onPatch({ condition })}>
                                    {CONDITION_ORDER.map((condition) => (
                                        <ListboxOption key={condition} value={condition}>
                                            <ListboxLabel>{conditionLabel(tg, condition)}</ListboxLabel>
                                        </ListboxOption>
                                    ))}
                                </Listbox>
                            </Field>

                            <Field>
                                <Label>{t("label.finish")}</Label>
                                <Listbox value={entry.finish} onChange={(finish) => onPatch({ finish })}>
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
                                    type="text"
                                    inputMode="decimal"
                                    value={price}
                                    placeholder="0.00"
                                    onChange={(event) => setPrice(event.target.value)}
                                    onBlur={commitPrice}
                                />
                            </Field>

                            <Field>
                                <Label>{t("label.acquired-at")}</Label>
                                <Input
                                    type="date"
                                    value={entry.acquiredAt ?? ""}
                                    onChange={(event) =>
                                        onPatch({ acquiredAt: event.target.value === "" ? null : event.target.value })
                                    }
                                />
                            </Field>
                        </div>
                    </DialogBody>
                )}
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.close")}
                    </Button>
                </DialogActions>
            </Dialog>

            <PrintingPicker
                card={pickingPrinting ? card : null}
                open={pickingPrinting}
                onClose={() => setPickingPrinting(false)}
                onSelect={(picked) => {
                    onReplaceCard(picked);
                    setPickingPrinting(false);
                }}
            />
        </>
    );
}
