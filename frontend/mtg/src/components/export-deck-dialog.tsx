import {
    Button,
    CopyButton,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Text,
    Textarea,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
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
 * @returns the dialog
 */
export function ExportDeckDialog({ open, source, onClose }: ExportDeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [text, setText] = useState("");
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
                    if (!dropped) setText(exportDecklist(answer.cards));
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

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.export")}</DialogTitle>
            <DialogDescription>{t("description.export")}</DialogDescription>
            <DialogBody>
                {loading ? (
                    <Text>{t("description.export-loading")}</Text>
                ) : failed ? (
                    <Text>{t("description.share-link-dead")}</Text>
                ) : (
                    <Textarea readOnly value={text} rows={16} className={"font-mono"} />
                )}
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
