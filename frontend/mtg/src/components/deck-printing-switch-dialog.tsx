import { ArrowUturnLeftIcon, ShoppingCartIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Strong,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionOverviewResponse, SourcedStackResponse } from "src/api/generated";
import { CollectionMarker } from "src/components/collection-marker";

/** What the picker holds while the copies should go back where they came from */
const ORIGIN = "";

/** The switch the dialog is asking about */
export type PrintingSwitch = {
    /** What the slot is called */
    name: string;
    /** The print it should hold from now on, as it will read in the list */
    to: string;
    /** The stacks lying in the deck's collection under the print it holds today */
    stacks: Array<SourcedStackResponse>;
};

/**
 * The properties for {@link DeckPrintingSwitchDialog}
 */
export type DeckPrintingSwitchDialogProps = {
    /** What is being switched, `null` while the dialog is closed */
    change: PrintingSwitch | null;
    /** The collections the copies could be sorted into */
    collections: Array<CollectionOverviewResponse>;
    /** Sorts the copies out of the deck and then switches the slot */
    onReturn: (target: string | null) => void;
    /** Leaves the copies in the deck and switches the slot anyway */
    onKeep: () => void;
    /** Called when the dialog should close without switching anything */
    onClose: () => void;
    /** Whether a write is in flight */
    busy: boolean;
};

/**
 * What happens to the cards already lying in the deck when its list moves on.
 *
 * A deck that keeps a collection is a box of cardboard, and pointing a slot at
 * another printing does not reach into the box. Either the copies go back on a
 * shelf, or they stay put and the deck knowingly holds a print its list no
 * longer asks for — which the sourcing view then reports rather than hiding.
 * Both are legitimate; what is not is deciding it silently.
 *
 * @returns the dialog
 */
export function DeckPrintingSwitchDialog({
    change,
    collections,
    onReturn,
    onKeep,
    onClose,
    busy,
}: DeckPrintingSwitchDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const [target, setTarget] = useState<string>(ORIGIN);

    // Every visit starts from the same answer, so a collection picked for one
    // card is not silently applied to the next.
    useEffect(() => {
        if (change !== null) setTarget(ORIGIN);
    }, [change]);

    const stacks = change?.stacks ?? [];
    const copies = stacks.reduce((sum, stack) => sum + stack.quantity, 0);
    // Copies bought straight into the deck remember no shelf, so there is
    // nowhere to send them back to without being told where.
    const homeless = stacks.some((stack) => stack.origin == null);
    const chosen = target === ORIGIN ? null : target;
    const canReturn = !homeless || chosen !== null;

    return (
        <Dialog open={change !== null} onClose={onClose}>
            <DialogTitle>{t("heading.printing-switch")}</DialogTitle>
            <DialogDescription>
                {t("description.printing-switch", {
                    count: copies,
                    name: change?.name ?? "",
                    printing: change?.to ?? "",
                })}
            </DialogDescription>
            <DialogBody className={"flex flex-col gap-4"}>
                <div className={"flex flex-col gap-1"}>
                    {stacks.map((stack) => (
                        <span key={stack.uuid} className={"flex items-center gap-1.5 text-sm"}>
                            <Strong className={"tabular-nums"}>{stack.quantity}×</Strong>
                            <Text>
                                {stack.card == null
                                    ? t("label.unknown-printing")
                                    : `${stack.card.set_code} ${stack.card.collector_number}`}
                            </Text>
                            {stack.origin_name != null && (
                                <span className={"flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"}>
                                    <CollectionMarker
                                        color={stack.origin_color ?? ""}
                                        icon={stack.origin_icon ?? ""}
                                        size={"sm"}
                                    />
                                    {stack.origin_name}
                                </span>
                            )}
                        </span>
                    ))}
                </div>

                <Listbox value={target} onChange={setTarget} aria-label={t("label.return-target")}>
                    {!homeless && (
                        <ListboxOption value={ORIGIN}>
                            <ListboxLabel>{t("label.return-to-origin")}</ListboxLabel>
                        </ListboxOption>
                    )}
                    {collections.map((collection) => (
                        <ListboxOption key={collection.collection.uuid} value={collection.collection.uuid}>
                            <ListboxLabel>{collection.collection.name}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button outline={true} disabled={busy} onClick={onKeep}>
                    <ShoppingCartIcon />
                    {t("button.printing-switch-keep")}
                </Button>
                <Button disabled={busy || !canReturn} onClick={() => onReturn(chosen)}>
                    <ArrowUturnLeftIcon />
                    {t("button.printing-switch-return")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
