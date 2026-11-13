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
    Text,
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
 * Throwing a deck away; the real cards in its Physical deck go back onto the shelf first.
 *
 * Deleting a deck never deletes cards. The real cards go back into the collections
 * they came from, so the only question is where those that remember none go; Proxies
 * are thrown away with the deck.
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
    const [busy, setBusy] = useState(false);

    const uuid = deck?.uuid ?? null;
    useEffect(() => {
        setCopies(0);
        setHomeless(false);
        if (uuid === null) return;

        let dropped = false;
        void (async () => {
            const [sourcing, collections] = await Promise.all([Api.decks.sourcing.read(uuid), Api.collections.list()]);
            if (dropped) return;
            const real = sourcing.filed.filter((stack) => !stack.proxy);
            setCopies(real.reduce((sum, stack) => sum + stack.quantity, 0));
            setHomeless(real.some((stack) => stack.origin == null));
            setBoxes(collections);
            setTarget(collections[0]?.collection.uuid ?? "");
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
            if (copies > 0) {
                await Api.decks.sourcing.takeApart(uuid, homeless ? target : null);
            }
            await Api.decks.delete(uuid);
            notify.success(t("toast.deck-deleted"));
            onClose();
            await onDeleted();
        } finally {
            setBusy(false);
        }
    }

    const nowhere = homeless && collections.length === 0;

    return (
        <Alert open={deck !== null} onClose={onClose}>
            <AlertTitle>{t("heading.delete-deck")}</AlertTitle>
            <AlertDescription>{t("description.delete-deck", { name: deck?.name ?? "" })}</AlertDescription>
            {copies > 0 && (
                <div className={"mt-4 flex flex-col gap-4"}>
                    <Text>{t("description.delete-deck-cards", { count: copies })}</Text>
                    {nowhere && <Text>{t("description.delete-deck-no-collection")}</Text>}
                    {homeless && collections.length > 0 && (
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
                <Button color={"red"} disabled={busy || nowhere} onClick={() => void remove()}>
                    {t("button.delete-deck")}
                </Button>
            </AlertActions>
        </Alert>
    );
}
