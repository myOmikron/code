import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardChooser } from "./card-chooser";
import { listPrintings } from "src/utils/scanned-card";
import type { CardRecord } from "src/types";

/**
 * The properties for {@link PrintingPicker}
 */
export type PrintingPickerProps = {
    card: CardRecord | null;
    open: boolean;
    onClose: () => void;
    onSelect: (card: CardRecord) => void;
};

/**
 * Pick any printing of a card.
 *
 * The scanner's own runners-up are only ever three, and the printing is the axis it is least sure
 * about — so a correction has to reach every printing of the card, not just the ones that happened
 * to rank. The list is fetched from the index on open (it needs the card's set shards, which are
 * usually already warm) rather than held in the staging entry, which keeps localStorage small.
 *
 * @returns the printing dialog
 */
export function PrintingPicker({ card, open, onClose, onSelect }: PrintingPickerProps) {
    const [t] = useTranslation("printing-picker");
    const [tg] = useTranslation();
    const [printings, setPrintings] = useState<CardRecord[] | null>(null);
    const [failed, setFailed] = useState(false);
    const name = card?.name ?? null;
    const lang = card?.lang ?? null;

    useEffect(() => {
        if (!open || !name) return;
        let active = true;
        setPrintings(null);
        setFailed(false);
        void listPrintings(name, lang ?? undefined)
            .then((result) => {
                if (active) setPrintings(result);
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => {
            active = false;
        };
    }, [open, name, lang]);

    // The scanned printing may be missing from the index lookup (a card the user corrected to
    // something outside it), so it is merged in rather than assumed present — otherwise the dialog
    // would show no selection at all.
    const shown =
        card && printings
            ? printings.some((printing) => printing.id === card.id)
                ? printings
                : [card, ...printings]
            : [];

    return (
        <Dialog open={open} onClose={onClose} size="2xl">
            <DialogTitle>{t("heading.choose-printing")}</DialogTitle>
            <DialogBody>
                {card && (
                    <>
                        <Text className="mb-3">
                            {printings === null && !failed
                                ? t("label.loading-printings", { name: card.name })
                                : t("label.printings", {
                                      count: shown.length,
                                      amount: shown.length,
                                      name: card.name,
                                  })}
                        </Text>
                        {failed && <Text>{t("error.printings-failed")}</Text>}
                        <CardChooser
                            cards={shown}
                            selectedId={card.id}
                            onSelect={onSelect}
                            label={t("accessibility.choose-printing-of", { name: card.name })}
                            layout="grid"
                        />
                    </>
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
