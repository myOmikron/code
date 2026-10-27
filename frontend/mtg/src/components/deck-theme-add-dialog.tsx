import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useTranslation } from "react-i18next";
import { DeckThemePicker } from "src/components/deck-theme-picker";

/**
 * The properties for {@link DeckThemeAddDialog}
 */
export type DeckThemeAddDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** How many cards read as each theme, by id — the detection, for reference */
    detected: Record<string, number>;
    /** Themes that already have a row, so the picker does not offer them twice */
    listed: Array<string>;
    /** Adds one theme to the panel */
    onAdd: (theme: string) => void;
};

/**
 * Puts a theme on the panel that the deck does not read as yet.
 *
 * The detector reads what is already in the list, which is the wrong question
 * for a deck halfway through being built: a Goblin deck with nine Goblins in
 * it does not read as Goblins yet, and the advisor's job at that moment is to
 * find the other twenty. So this is the way in — name the strategy, and it
 * gets a row with a level the reader can then set.
 *
 * One pick closes the dialog: the row it creates is where the amount is
 * decided, and a second theme is a second trip through the same door.
 *
 * @returns the dialog
 */
export function DeckThemeAddDialog({ open, onClose, detected, listed, onAdd }: DeckThemeAddDialogProps) {
    const [t] = useTranslation("advisor");

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.add-theme")}</DialogTitle>
            <DialogBody>
                <Text>{t("description.add-theme")}</Text>
                <DeckThemePicker
                    picked={listed}
                    detected={detected}
                    onToggle={(theme) => {
                        // A theme that already has a row is shown ticked and a
                        // tap on it does nothing — the row is where it is edited.
                        if (listed.includes(theme)) return;
                        onAdd(theme);
                        onClose();
                    }}
                />
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.cancel")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
