import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Label,
    Radio,
    RadioField,
    RadioGroup,
} from "components";
import { startTransition } from "react";
import { useTranslation } from "react-i18next";
import type { DeckView } from "src/utils/deck-view-settings";

/**
 * The properties for {@link DeckViewDialog}
 */
export type DeckViewDialogProps<Grouping extends string> = {
    /** Which choice is open, `null` while closed */
    choosing: "view" | "group" | null;
    /** How the cards are laid out */
    view: DeckView;
    /** The layouts on offer */
    views: Array<DeckView>;
    /** What the list is broken up by */
    grouping: Grouping;
    /** The groupings on offer */
    groupings: Array<Grouping>;
    /** What a grouping is called */
    groupingLabel: (grouping: Grouping) => string;
    /** Records a different layout */
    onChangeView: (view: DeckView) => void;
    /** Records a different grouping */
    onChangeGrouping: (grouping: Grouping) => void;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Layout or grouping as a list of choices, what the `v` and `g` keys open.
 *
 * The choice is applied a frame after the dialog closed, so the dialog leaves
 * at once and the list redraws behind it rather than under it.
 *
 * @returns the dialog
 */
export function DeckViewDialog<Grouping extends string>({
    choosing,
    view,
    views,
    grouping,
    groupings,
    groupingLabel,
    onChangeView,
    onChangeGrouping,
    onClose,
}: DeckViewDialogProps<Grouping>) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    return (
        <Dialog open={choosing !== null} onClose={onClose} size={"sm"}>
            <DialogTitle>{choosing === "view" ? t("label.view") : t("label.grouping")}</DialogTitle>
            <DialogBody>
                {choosing === "view" ? (
                    <RadioGroup
                        value={view}
                        onChange={(next: string) => {
                            onClose();
                            requestAnimationFrame(() => {
                                startTransition(() => onChangeView(next as DeckView));
                            });
                        }}
                    >
                        {views.map((option) => (
                            <RadioField key={option}>
                                <Radio value={option} color={"lime"} />
                                <Label>{t(`label.view-${option}`)}</Label>
                            </RadioField>
                        ))}
                    </RadioGroup>
                ) : (
                    <RadioGroup
                        value={grouping}
                        onChange={(next: string) => {
                            onClose();
                            requestAnimationFrame(() => {
                                startTransition(() => onChangeGrouping(next as Grouping));
                            });
                        }}
                    >
                        {groupings.map((option) => (
                            <RadioField key={option}>
                                <Radio value={option} color={"lime"} />
                                <Label>{groupingLabel(option)}</Label>
                            </RadioField>
                        ))}
                    </RadioGroup>
                )}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
