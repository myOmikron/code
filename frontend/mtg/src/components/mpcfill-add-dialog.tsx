import { Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "components";
import { useTranslation } from "react-i18next";
import { CardSearchPanel } from "src/components/card-search-panel";
import { ProxyDeckPicker } from "src/components/proxy-deck-picker";
import { ProxyGroupRow } from "src/components/proxy-group-row";
import { mpcCards, mpcCount } from "src/utils/mpcfill";
import { groupKey } from "src/utils/proxy-list";
import type { ProxyPicks } from "src/utils/use-proxy-picks";

/**
 * The properties for {@link MpcFillAddDialog}
 */
export type MpcFillAddDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The order's cards and everything that changes them */
    picks: ProxyPicks;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * Where the cards of an order come from.
 *
 * Behind a dialog rather than beside the cards: an order is looked at far more
 * often than it is added to, and a card search that keeps half the width for
 * itself leaves the artwork — the thing this page is for — in a column too
 * narrow to judge it in. What is added shows up in the grid behind the dialog,
 * which stays open for the next card.
 *
 * @returns the dialog
 */
export function MpcFillAddDialog({ open, picks, onClose }: MpcFillAddDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();
    const added = picks.groups.filter((group) => group.deck !== null);

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.add-cards")}</DialogTitle>
            <DialogDescription>{t("description.add-cards")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    {picks.decks.length > 0 && (
                        <div className={"flex flex-col gap-3"}>
                            <ProxyDeckPicker picks={picks} />
                            {added.length > 0 && (
                                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                    {added.map((group) => (
                                        <li key={groupKey(group)} className={"py-1"}>
                                            <ProxyGroupRow
                                                group={group}
                                                count={mpcCount(mpcCards(group.cards, false))}
                                                onDropDeck={picks.dropDeck}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div>
                        <CardSearchPanel
                            unique={"cards"}
                            autoFocus={true}
                            stickySearch={true}
                            hideInfoOnMobile={true}
                            countOf={(printing) => picks.countOf(printing.id)}
                            onAdd={picks.add}
                            onRemove={(printing) => picks.fewer(printing.id)}
                        />
                    </div>
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain={true} onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
