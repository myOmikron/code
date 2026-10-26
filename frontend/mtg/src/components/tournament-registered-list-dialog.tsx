import { Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle, Subheading } from "components";
import { useTranslation } from "react-i18next";
import { type RegisteredListResponse, DeckZone } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/** The zones a list shows, in the order it shows them; the maybeboard is no part of what was played */
const ZONES = [DeckZone.Commander, DeckZone.Companion, DeckZone.Main, DeckZone.Side];

/**
 * The properties for {@link TournamentRegisteredListDialog}
 */
export type TournamentRegisteredListDialogProps = {
    /** The list to show; the dialog is open while it is not `null` */
    list: RegisteredListResponse | null;
    /** Who played it */
    player: string;
    /** Called when the dialog should close */
    onClose: () => void;
};

/**
 * A Registered deck's list as it was played, zone by zone.
 *
 * @returns the dialog
 */
export function TournamentRegisteredListDialog({ list, player, onClose }: TournamentRegisteredListDialogProps) {
    const [t] = useTranslation("tournament");
    const [tg] = useTranslation();
    const deckLabels = useDeckLabels();
    const cards = list?.cards ?? [];

    return (
        <Dialog open={list !== null} onClose={onClose}>
            <DialogTitle>{list?.name}</DialogTitle>
            <DialogDescription>
                {t("description.registered-list", { player, format: deckLabels.format(list?.format ?? "") })}
            </DialogDescription>
            <DialogBody className={"flex flex-col gap-4"}>
                {ZONES.map((zone) => {
                    const slots = cards.filter((slot) => slot.zone === zone);
                    if (slots.length === 0) return null;
                    const count = slots.reduce((sum, slot) => sum + slot.quantity, 0);
                    return (
                        <section key={zone} className={"flex flex-col gap-1"}>
                            <Subheading>{t("label.list-zone", { zone: deckLabels.zone(zone), count })}</Subheading>
                            <ul className={"text-sm/6 text-zinc-700 dark:text-zinc-300"}>
                                {slots.map((slot) => (
                                    <li key={slot.uuid} className={"flex gap-2"}>
                                        <span className={"w-6 text-right tabular-nums"}>{slot.quantity}</span>
                                        <span>{slot.card?.name ?? t("label.unknown-card")}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
