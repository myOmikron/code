import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    Field,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Description,
    Switch,
    SwitchField,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { CollectionOverviewResponse } from "src/api/generated";

/**
 * The properties for {@link DeckDeleteDialog}
 */
export type DeckDeleteDialogProps = {
    /** The deck to throw away, `null` to keep the dialog closed */
    deck: { uuid: string; name: string } | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the deck was deleted */
    onDeleted: () => void | Promise<void>;
};

/**
 * Throwing a deck away, and deciding what happens to the cards in it.
 *
 * A deck that keeps a collection is holding real cardboard. Deleting it without
 * asking would take those cards out of the inventory as if they had been sold,
 * so the question is put before the deed — and only when there is anything to
 * ask about.
 *
 * @returns the dialog
 */
export function DeckDeleteDialog({ deck, onClose, onDeleted }: DeckDeleteDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const [copies, setCopies] = useState(0);
    const [homeless, setHomeless] = useState(false);
    const [collections, setBoxes] = useState<Array<CollectionOverviewResponse>>([]);
    const [target, setTarget] = useState("");
    const [giveBack, setGiveBack] = useState(true);
    const [busy, setBusy] = useState(false);

    const uuid = deck?.uuid ?? null;
    useEffect(() => {
        setCopies(0);
        setHomeless(false);
        setGiveBack(true);
        if (uuid === null) return;

        let dropped = false;
        void (async () => {
            const [sourcing, collections] = await Promise.all([Api.decks.sourcing.read(uuid), Api.collections.list()]);
            if (dropped) return;
            const shelf = collections.filter((collection) => collection.collection.deck == null);
            setCopies(sourcing.filed.reduce((sum, stack) => sum + stack.quantity, 0));
            setHomeless(sourcing.filed.some((stack) => stack.origin == null));
            setBoxes(shelf);
            setTarget(shelf[0]?.collection.uuid ?? "");
        })();
        return () => {
            dropped = true;
        };
    }, [uuid]);

    /**
     * Sorts the cards back where asked, then deletes the deck
     */
    async function remove() {
        if (uuid === null) return;
        setBusy(true);
        try {
            if (copies > 0 && giveBack) {
                await Api.decks.sourcing.returnAll(uuid, homeless ? target : null);
            }
            await Api.decks.delete(uuid);
            notify.success(t("toast.deck-deleted"));
            onClose();
            await onDeleted();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Alert open={deck !== null} onClose={onClose}>
            <AlertTitle>{t("heading.delete-deck")}</AlertTitle>
            <AlertDescription>{t("description.delete-deck", { name: deck?.name ?? "" })}</AlertDescription>
            {copies > 0 && (
                <div className={"mt-4 flex flex-col gap-4"}>
                    <SwitchField>
                        <Label>{t("label.return-cards")}</Label>
                        <Description>{t("description.delete-deck-cards", { count: copies })}</Description>
                        <Switch color={"blue"} checked={giveBack} onChange={setGiveBack} />
                    </SwitchField>
                    {giveBack && homeless && collections.length > 0 && (
                        <Field>
                            <Label>{t("label.return-target")}</Label>
                            <Listbox value={target} onChange={setTarget}>
                                {collections.map((collection) => (
                                    <ListboxOption key={collection.collection.uuid} value={collection.collection.uuid}>
                                        <ListboxLabel>{collection.collection.name}</ListboxLabel>
                                    </ListboxOption>
                                ))}
                            </Listbox>
                        </Field>
                    )}
                </div>
            )}
            <AlertActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button color={"red"} disabled={busy} onClick={() => void remove()}>
                    {t("button.delete-deck")}
                </Button>
            </AlertActions>
        </Alert>
    );
}
