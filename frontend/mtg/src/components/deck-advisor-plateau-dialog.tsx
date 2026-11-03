import { Button, Dialog, DialogActions, DialogDescription, DialogTitle } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link DeckAdvisorPlateauDialog}
 */
export type DeckAdvisorPlateauDialogProps = {
    open: boolean;
    /** The reader goes to play the deck; the advisor asks how it went later */
    onPlay: () => void;
    /** The reader keeps tuning anyway */
    onClose: () => void;
};

/**
 * Said once a full deck has no swap left that clearly helps: the next
 * improvement comes from playing it.
 *
 * @returns the dialog
 */
export function DeckAdvisorPlateauDialog({ open, onPlay, onClose }: DeckAdvisorPlateauDialogProps) {
    const [t] = useTranslation("advisor");

    return (
        <Dialog open={open} onClose={onClose} size={"md"}>
            <DialogTitle>{t("heading.plateau")}</DialogTitle>
            <DialogDescription>{t("description.plateau")}</DialogDescription>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.keep-tuning")}
                </Button>
                <Button color={"lime"} onClick={onPlay}>
                    {t("button.play-first")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
