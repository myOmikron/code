import {
    Button,
    Combobox,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Label,
    Switch,
    SwitchField,
} from "components";
import { useTranslation } from "react-i18next";
import type { DeckOverviewResponse } from "src/api/generated";
import { CardSearchPanel } from "src/components/card-search-panel";
import type { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link MpcFillAddDialog}
 */
export type MpcFillAddDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The decks the account may take from, empty without one */
    decks: Array<DeckOverviewResponse>;
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
    /** Takes the chosen deck */
    onLoadDeck: () => void;
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
    deck,
    onDeck,
    onlyProxies,
    onOnlyProxies,
    loading,
    onLoadDeck,
    countOf,
    onAdd,
    onRemove,
    onClose,
}: MpcFillAddDialogProps) {
    const [t] = useTranslation("game-utils");
    const [tg] = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} size={"3xl"}>
            <DialogTitle>{t("heading.add-cards")}</DialogTitle>
            <DialogDescription>{t("description.add-cards")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-5"}>
                    {decks.length > 0 && (
                        <div className={"flex flex-col gap-3"}>
                            <div className={"flex items-end gap-2"}>
                                <Field className={"min-w-0 flex-1"}>
                                    <Label>{t("label.deck")}</Label>
                                    <Combobox
                                        options={decks}
                                        value={deck}
                                        onChange={(chosen) => onDeck(chosen)}
                                        placeholder={t("label.search-deck")}
                                        displayValue={(overview) => overview?.deck.name ?? ""}
                                    >
                                        {(overview) => (
                                            <ComboboxOption value={overview}>
                                                <ComboboxLabel>{overview.deck.name}</ComboboxLabel>
                                            </ComboboxOption>
                                        )}
                                    </Combobox>
                                </Field>
                                <Button
                                    outline={true}
                                    className={"shrink-0"}
                                    disabled={deck === null || loading}
                                    onClick={onLoadDeck}
                                >
                                    {t("button.load-deck")}
                                </Button>
                            </div>
                            <SwitchField>
                                <Label>{t("label.only-proxies")}</Label>
                                <Description>{t("description.only-proxies")}</Description>
                                <Switch color={"blue"} checked={onlyProxies} onChange={onOnlyProxies} />
                            </SwitchField>
                        </div>
                    )}

                    {/* Scrolls inside the dialog: the results are a page of
                        Scryfall, and a dialog that grows with them buries its
                        own search field. */}
                    <div className={"max-h-[55vh] min-h-0 overflow-y-auto overscroll-contain"}>
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
