import {
    Button,
    Checkbox,
    CheckboxField,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Label,
    Text,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { letters } from "src/utils/deck-rules";

/** The colours a deck can be held to, in the order they are written */
const COLOR_LETTERS = ["W", "U", "B", "R", "G"];

/**
 * The properties for {@link DeckColorDialog}
 */
export type DeckColorDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The colours the deck plays today */
    colors: Array<string>;
    /** Whether those were set by hand rather than derived */
    overruled: boolean;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Called with the letters to store, empty to follow the commander */
    onSave: (colors: string) => void;
};

/**
 * Which colours the deck may play, when the commander is not the last word.
 *
 * @returns the dialog
 */
export function DeckColorDialog({ open, colors, overruled, onClose, onSave }: DeckColorDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();
    const [picked, setPicked] = useState<Array<string>>(colors);
    const [follow, setFollow] = useState(!overruled);

    useEffect(() => {
        setPicked(colors);
        setFollow(!overruled);
    }, [colors, overruled, open]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.colors")}</DialogTitle>
            <DialogBody>
                <div className={"flex flex-col gap-4"}>
                    <Text>{t("description.colors")}</Text>
                    <CheckboxField>
                        <Checkbox checked={follow} onChange={setFollow} />
                        <Label>{t("label.colors-follow-commander")}</Label>
                    </CheckboxField>
                    <div className={"flex flex-wrap gap-4"}>
                        {COLOR_LETTERS.map((color) => (
                            <CheckboxField key={color}>
                                <Checkbox
                                    disabled={follow}
                                    checked={picked.includes(color)}
                                    onChange={(checked) =>
                                        setPicked((previous) =>
                                            checked
                                                ? COLOR_LETTERS.filter(
                                                      (letter) => previous.includes(letter) || letter === color,
                                                  )
                                                : previous.filter((letter) => letter !== color),
                                        )
                                    }
                                />
                                <Label>{color}</Label>
                            </CheckboxField>
                        ))}
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button onClick={() => onSave(follow ? "" : letters(picked.join("")).join(""))}>
                    {t("button.save-colors")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
