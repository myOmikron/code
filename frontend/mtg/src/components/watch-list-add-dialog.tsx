import { Dialog, DialogBody, DialogTitle, Text } from "components";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link WatchListAddDialog}
 */
export type WatchListAddDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Called when the dialog should close */
    onClose: () => void;
    /** Puts the picked print on the list, in the finish it was picked for */
    onPick: (printing: Printing, finish: CardFinish) => void;
};

/**
 * Searching for a card to watch.
 *
 * Searches Scryfall through the panel the deck builder already uses, so the
 * whole syntax works here as well: `set:`, `art:`, `is:foil` and the rest.
 * A hit is put on the list in the plainest finish the print exists in, which is
 * the one somebody after a card usually means; the entry's own dialog is where
 * the foil is chosen and the two switches are set.
 *
 * @returns the dialog
 */
export function WatchListAddDialog({ open, onClose, onPick }: WatchListAddDialogProps) {
    const [t] = useTranslation("watch-list");

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.add-card")}</DialogTitle>
            <DialogBody>
                <Text className={"mb-3 text-sm"}>{t("description.price-source")}</Text>
                <CardSearchPanel
                    onPick={(printing) => onPick(printing, plainestFinish(printing))}
                    stickySearch={true}
                    hideInfoOnMobile={true}
                />
            </DialogBody>
        </Dialog>
    );
}

/**
 * The finish a print is put on the list in when nobody has said otherwise
 *
 * @param printing the print that was picked
 *
 * @returns non-foil where the print exists that way, otherwise what it does exist as
 */
function plainestFinish(printing: Printing): CardFinish {
    if (printing.finishes.includes("nonfoil")) return "Nonfoil";
    if (printing.finishes.includes("foil")) return "Foil";
    if (printing.finishes.includes("etched")) return "Etched";
    return "Nonfoil";
}
