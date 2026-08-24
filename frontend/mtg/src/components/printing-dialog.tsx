import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { useTranslation } from "react-i18next";
import { DeckPrintingPicker } from "src/components/deck-printing-picker";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link PrintingDialog}
 */
export type PrintingDialogProps = {
    /** The card whose print run is being changed, `null` to keep the dialog closed */
    card: { name: string; printing: string } | null;
    /** Records a different print run */
    onPick: (printing: Printing) => void;
    /** Called when the dialog should close */
    onClose: () => void;
    /** The printings of this card that lie in one of the account's collections */
    owned?: ReadonlySet<string>;
};

/**
 * Every print of one card, to pick the one a slot or a stack should hold.
 *
 * The same picker the card's own dialog carries, on its own: reached with `P`
 * or from a card's menu, both of which skip the trip through the card view for
 * what is a one-click decision. A deck slot and a stack on a shelf both come
 * down to a name and the print it holds, so both are handed in as that.
 *
 * @returns the dialog
 */
export function PrintingDialog({ card, onPick, onClose, owned }: PrintingDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    return (
        <Dialog open={card !== null} onClose={onClose} size={"5xl"}>
            <DialogTitle>{card?.name ?? t("heading.printing")}</DialogTitle>
            {/* A card with thirty prints would otherwise grow a dialog taller
                than the phone it is read on, and the close button ends up below
                the fold. The prints scroll, the frame stays put. */}
            <DialogBody className={"max-h-[65svh] overflow-y-auto"}>
                {card !== null && (
                    <DeckPrintingPicker
                        name={card.name}
                        current={card.printing}
                        startOpen={true}
                        owned={owned}
                        onPick={onPick}
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
