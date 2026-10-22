import { Alert, AlertActions, AlertDescription, AlertTitle, Button, notify } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";

/**
 * The properties for {@link DeckLeaveDialog}
 */
export type DeckLeaveDialogProps = {
    /** The deck to leave, `null` to keep the dialog closed */
    deck: { uuid: string; name: string } | null;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called after the reader left the deck */
    onLeft: () => void | Promise<void>;
};

/**
 * Leaving a deck another account shared with the reader.
 *
 * @returns the dialog
 */
export function DeckLeaveDialog({ deck, onClose, onLeft }: DeckLeaveDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const [busy, setBusy] = useState(false);

    /**
     * Takes the reader off the deck, then closes
     */
    async function leave() {
        if (deck === null) return;
        setBusy(true);
        try {
            await Api.decks.leave(deck.uuid);
            notify.success(t("toast.deck-left"));
            onClose();
            await onLeft();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Alert open={deck !== null} onClose={onClose}>
            <AlertTitle>{t("heading.leave-deck")}</AlertTitle>
            <AlertDescription>{t("description.leave-deck", { name: deck?.name ?? "" })}</AlertDescription>
            <AlertActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button color={"red"} disabled={busy} onClick={() => void leave()}>
                    {t("button.leave-deck")}
                </Button>
            </AlertActions>
        </Alert>
    );
}
