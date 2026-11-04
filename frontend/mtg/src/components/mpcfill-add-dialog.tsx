import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Label,
    Switch,
    SwitchField,
} from "components";
import { useTranslation } from "react-i18next";
import type { DeckOverviewResponse } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import { ProxyDeckPicker } from "src/components/proxy-deck-picker";
import { ProxyGroupRow } from "src/components/proxy-group-row";
import type { ProxyGroup } from "src/utils/proxy-list";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link MpcFillAddDialog}
 */
export type MpcFillAddDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The decks the account may take from, empty without one */
    decks: Array<DeckOverviewResponse>;
    /** What is on the order */
    groups: Array<ProxyGroup>;
    /** How many cards of a group go out */
    groupCount: (group: ProxyGroup) => number;
    /** Takes a group and its cards off, `null` for the hand picks */
    onDropDeck: (uuid: string | null) => void;
    /** The deck the combobox stands on */
    deck: DeckOverviewResponse | null;
    /** Chooses a deck without taking it yet */
    onDeck: (deck: DeckOverviewResponse | null) => void;
    /** Whether a deck is taken with only its proxy-marked slots */
    onlyProxies: boolean;
    /** Switches that over */
    onOnlyProxies: (only: boolean) => void;
    /** Whether a deck is being read right now */
    loading: boolean;
    /** Adds the chosen deck */
    onAddDeck: () => void;
    /** How many copies of a hit are already on the order */
    countOf: (printing: Printing) => number;
    /** Puts one more copy on the order */
    onAdd: (printing: Printing) => void;
    /** Takes one copy back off */
    onRemove: (printing: Printing) => void;
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
export function MpcFillAddDialog({
    open,
    decks,
    groups,
    groupCount,
    onDropDeck,
    deck,
    onDeck,
    onlyProxies,
    onOnlyProxies,
    loading,
    onAddDeck,
    countOf,
    onAdd,
    onRemove,
    onClose,
}: MpcFillAddDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();
    const added = groups.filter((group) => group.deck !== null);

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.add-cards")}</DialogTitle>
            <DialogDescription>{t("description.add-cards")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    {decks.length > 0 && (
                        <div className={"flex flex-col gap-3"}>
                            <ProxyDeckPicker
                                decks={decks}
                                groups={groups}
                                deck={deck}
                                onDeck={onDeck}
                                loading={loading}
                                onAdd={onAddDeck}
                            />
                            {added.length > 0 && (
                                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                                    {added.map((group) => (
                                        <li key={group.deck?.uuid} className={"py-1"}>
                                            <ProxyGroupRow
                                                group={group}
                                                count={groupCount(group)}
                                                onDropDeck={onDropDeck}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <SwitchField>
                                <Label>{t("label.only-proxies")}</Label>
                                <Description>{t("description.only-proxies")}</Description>
                                <Switch color={"lime"} checked={onlyProxies} onChange={onOnlyProxies} />
                            </SwitchField>
                        </div>
                    )}

                    <div>
                        <CardSearchPanel
                            unique={"cards"}
                            autoFocus={true}
                            stickySearch={true}
                            hideInfoOnMobile={true}
                            countOf={countOf}
                            onAdd={onAdd}
                            onRemove={onRemove}
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
