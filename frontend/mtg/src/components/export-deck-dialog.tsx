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
    /** The deck being written out */
    deckUuid: string;
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
export function ExportDeckDialog({ open, deckUuid, onClose }: ExportDeckDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

        let dropped = false;
        setLoading(true);
        void Api.decks.cards.list(deckUuid).then((answer) => {
            if (dropped) return;
            setText(exportDecklist(answer.cards));
            setLoading(false);
        });

        return () => {
            dropped = true;
        };
    }, [open, deckUuid]);

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.export")}</DialogTitle>
            <DialogDescription>{t("description.export")}</DialogDescription>
            <DialogBody>
                {loading ? (
                    <Text>{t("description.export-loading")}</Text>
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
