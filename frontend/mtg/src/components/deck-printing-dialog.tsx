import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { useTranslation } from "react-i18next";
import type { DeckCardResponse } from "src/api/generated";
import { DeckPrintingPicker } from "src/components/deck-printing-picker";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckPrintingDialog}
 */
export type DeckPrintingDialogProps = {
    /** The slot whose print run is being changed, `null` to keep it closed */
    card: DeckCardResponse | null;
    /** Records a different print run */
    onPick: (card: DeckCardResponse, printing: Printing) => void;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * Every print of one card, to pick the one the slot should hold.
 *
 * The same picker the card's own dialog carries, on its own: reached with `P`
 * or from a card's menu, both of which skip the trip through the card view for
 * what is a one-click decision.
 *
 * @returns the dialog
 */
export function DeckPrintingDialog({ card, onPick, onClose }: DeckPrintingDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    return (
        <Dialog open={card !== null} onClose={onClose} size={"5xl"}>
            <DialogTitle>{card?.card?.name ?? t("heading.printing")}</DialogTitle>
            <DialogBody>
                {card?.card != null && (
                    <DeckPrintingPicker
                        name={card.card.name}
                        current={card.printing}
                        startOpen={true}
                        onPick={(printing) => onPick(card, printing)}
                    />
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
