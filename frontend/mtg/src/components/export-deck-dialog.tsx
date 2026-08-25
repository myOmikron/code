import {
    Button,
    CopyButton,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Label,
    Switch,
    SwitchField,
    Text,
    Textarea,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DeckCardResponse } from "src/api/generated";
import { exportDecklist } from "src/utils/deck-export";

/**
 * The properties for {@link ExportDeckDialog}
 */
export type ExportDeckDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /**
     * The deck being written out: one of the reader's own, or one they are
     * looking at through a share link
     */
    source: { deckUuid: string } | { token: string };
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * The deck as plain text, ready to be pasted into another builder.
 *
 * The list is read fresh when the dialog opens rather than handed down: the
 * actions menu sits above the tabs and does not hold the deck's cards, and one
 * request at the moment somebody asks for the list is cheaper than keeping a
 * copy in the page that has to be kept honest.
 *
 * Whether the lines name the print is a switch, because the same list is asked
 * for twice: with the prints to rebuild the deck card for card, without them to
 * hand somebody the seventy-five names and let them sleeve what they own. The
 * slots are kept so flipping it rewrites the text without asking again.
 *
 * @returns the dialog
 */
export function ExportDeckDialog({ open, source, onClose }: ExportDeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [cards, setCards] = useState<Array<DeckCardResponse>>([]);
    const [withPrinting, setWithPrinting] = useState(true);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const deckUuid = "deckUuid" in source ? source.deckUuid : null;
    const token = "token" in source ? source.token : null;

    useEffect(() => {
        if (!open) return;

        let dropped = false;
        setLoading(true);
        setFailed(false);
        const listing = deckUuid !== null ? Api.decks.cards.list(deckUuid) : Api.shared.decks.cards(token ?? "");
        void listing
            .then(
                (answer) => {
                    if (!dropped) setCards(answer.cards);
                },
                () => {
                    if (!dropped) setFailed(true);
                },
            )
            .finally(() => {
                if (!dropped) setLoading(false);
            });

        return () => {
            dropped = true;
        };
    }, [open, deckUuid, token]);

    const text = exportDecklist(cards, withPrinting);

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.export")}</DialogTitle>
            <DialogDescription>{t("description.export")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    <SwitchField>
                        <Label>{t("label.export-with-printing")}</Label>
                        <Description>{t("description.export-with-printing")}</Description>
                        <Switch color={"blue"} checked={withPrinting} onChange={setWithPrinting} />
                    </SwitchField>

                    {loading ? (
                        <Text>{t("description.export-loading")}</Text>
                    ) : failed ? (
                        <Text>{t("description.share-link-dead")}</Text>
                    ) : (
                        <Textarea readOnly value={text} rows={16} className={"font-mono"} />
                    )}
                </div>
            </DialogBody>
            <DialogActions>
                <CopyButton value={text} label={t("button.copy-decklist")} />
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
