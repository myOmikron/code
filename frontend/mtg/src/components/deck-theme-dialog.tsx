import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeckThemePicker } from "src/components/deck-theme-picker";

/**
 * The properties for {@link DeckThemeDialog}
 */
export type DeckThemeDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The themes currently argued for */
    pinned: Array<string>;
    /** How many cards read as each theme, by id — the detection, for reference */
    detected: Record<string, number>;
    /** Records the themes the deck is played for */
    onSave: (themes: Array<string>) => void;
};

/**
 * What the deck is *meant* to be doing, said by the person building it.
 *
 * The detector reads what is already in the list, which is the wrong question
 * for a deck halfway through being built: a Goblin deck with nine Goblins in
 * it does not read as Goblins yet, and the advisor's job at that moment is to
 * find the other twenty. So this is the way in — pick the strategies, and
 * every suggestion, swap and fill is argued for them.
 *
 * The picker itself is {@link DeckThemePicker} — this dialog only stages the
 * picks locally until Save, and hands the whole set back at once.
 *
 * @returns the dialog
 */
export function DeckThemeDialog({ open, onClose, pinned, detected, onSave }: DeckThemeDialogProps) {
    const [t] = useTranslation("advisor");
    const [picked, setPicked] = useState<Array<string>>(pinned);

    // Re-seeded per opening: the dialog outlives the deck it was opened on.
    useEffect(() => {
        if (!open) return;
        setPicked(pinned);
    }, [open]);

    /**
     * Adds or removes one theme from the picks
     *
     * @param theme the theme id that was clicked
     */
    function toggle(theme: string) {
        setPicked((held) => (held.includes(theme) ? held.filter((id) => id !== theme) : [...held, theme]));
    }

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.define-themes")}</DialogTitle>
            <DialogBody>
                <Text>{t("description.define-themes")}</Text>
                <DeckThemePicker picked={picked} onToggle={toggle} detected={detected} />
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {t("button.cancel")}
                </Button>
                <Button
                    color={"blue"}
                    onClick={() => {
                        onSave(picked);
                        onClose();
                    }}
                >
                    {t("button.save-themes")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
