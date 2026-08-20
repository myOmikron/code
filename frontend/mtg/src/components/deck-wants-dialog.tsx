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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { wantsList } from "src/utils/wants-list";
import type { MissingCard } from "src/utils/wants-list";

/** One card of the deck, with both numbers a shopping list can be built from */
export type WantsRow = MissingCard & {
    /** Copies lying in a collection that have not been sleeved into the deck yet */
    available: number;
};

/**
 * The properties for {@link DeckWantsDialog}
 */
export type DeckWantsDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Every card of the deck that is short of copies */
    rows: Array<WantsRow>;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * What the deck still needs, as a list to paste into Cardmarket.
 *
 * Two decisions belong to whoever is buying, so both are switches rather than
 * assumptions: whether the line names the edition the deck lists, and whether
 * cards that are only lying in a collection count as missing. The second one turns the
 * wants list into a picking list for the shelf at home, which is the same
 * question asked one room earlier.
 *
 * @returns the dialog
 */
export function DeckWantsDialog({ open, rows, onClose }: DeckWantsDialogProps) {
    const [t] = useTranslation("collection");
    const [tg] = useTranslation();
    const [withAvailable, setWithAvailable] = useState(false);

    const wanted = rows.map((row) => ({
        ...row,
        missing: row.missing + (withAvailable ? row.available : 0),
    }));
    const text = wantsList(wanted);
    const cards = wanted.reduce((sum, row) => sum + row.missing, 0);

    return (
        <Dialog open={open} onClose={onClose} size={"2xl"}>
            <DialogTitle>{t("heading.wants-list")}</DialogTitle>
            <DialogDescription>{t("description.wants-list")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    <SwitchField>
                        <Label>{t("label.wants-with-available")}</Label>
                        <Description>{t("description.wants-with-available")}</Description>
                        <Switch color={"blue"} checked={withAvailable} onChange={setWithAvailable} />
                    </SwitchField>

                    <Textarea readOnly={true} value={text} rows={12} className={"font-mono"} />
                    <Text className={"tabular-nums"}>{t("label.wants-count", { count: cards })}</Text>
                </div>
            </DialogBody>
            <DialogActions>
                <CopyButton value={text} label={t("button.copy-wants")} />
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
