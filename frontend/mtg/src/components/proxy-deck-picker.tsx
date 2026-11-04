import { PlusIcon } from "@heroicons/react/20/solid";
import { Button, Combobox, ComboboxDescription, ComboboxLabel, ComboboxOption, Field, Label } from "components";
import { useTranslation } from "react-i18next";
import type { DeckOverviewResponse } from "src/api/generated";
import type { ProxyGroup } from "src/utils/proxy-list";

/**
 * The properties for {@link ProxyDeckPicker}
 */
export type ProxyDeckPickerProps = {
    /** The decks the account may take from */
    decks: Array<DeckOverviewResponse>;
    /** What is on the list; adding a deck already on it tops it up */
    groups: Array<ProxyGroup>;
    /** The deck the combobox stands on */
    deck: DeckOverviewResponse | null;
    /** Chooses a deck without adding it yet */
    onDeck: (deck: DeckOverviewResponse | null) => void;
    /** Whether a deck is being read right now */
    loading: boolean;
    /** Adds the chosen deck */
    onAdd: () => void;
};

/**
 * Picks one more deck for a proxy list.
 *
 * @returns the combobox and its button
 */
export function ProxyDeckPicker({ decks, groups, deck, onDeck, loading, onAdd }: ProxyDeckPickerProps) {
    const [t] = useTranslation("game-utils");

    return (
        <div className={"flex gap-2 max-sm:flex-col sm:items-end"}>
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
                            {groups.some((group) => group.deck?.uuid === overview.deck.uuid) && (
                                <ComboboxDescription>{t("label.on-the-list")}</ComboboxDescription>
                            )}
                        </ComboboxOption>
                    )}
                </Combobox>
            </Field>
            <Button
                outline={true}
                className={"shrink-0 max-sm:w-full"}
                disabled={deck === null || loading}
                onClick={onAdd}
            >
                <PlusIcon />
                {t("button.load-deck")}
            </Button>
        </div>
    );
}
