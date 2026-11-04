import { PlusIcon } from "@heroicons/react/20/solid";
import { Button, Combobox, ComboboxDescription, ComboboxLabel, ComboboxOption, Field, Label } from "components";
import { useTranslation } from "react-i18next";
import type { DeckOverviewResponse } from "src/api/generated";
import { ProxyGroupRow } from "src/components/proxy-group-row";
import type { ProxyGroup } from "src/utils/proxy-list";

/**
 * The properties for {@link ProxyDeckPicker}
 */
export type ProxyDeckPickerProps = {
    /** The decks the account may take from */
    decks: Array<DeckOverviewResponse>;
    /** What is on the list; adding a deck already on it tops it up */
    groups: Array<ProxyGroup>;
    /** How many cards of a group go out, as the page counts them */
    countOf: (group: ProxyGroup) => number;
    /** Takes a deck and its cards off */
    onDropDeck: (uuid: string) => void;
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
 * Picks one more deck for a proxy list, above the decks already on it.
 *
 * @returns the combobox, its button and the decks added
 */
export function ProxyDeckPicker({
    decks,
    groups,
    countOf,
    onDropDeck,
    deck,
    onDeck,
    loading,
    onAdd,
}: ProxyDeckPickerProps) {
    const [t] = useTranslation("game-utils");
    const added = groups.filter((group) => group.deck !== null);

    return (
        <div className={"flex flex-col gap-2"}>
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
                                {added.some((group) => group.deck?.uuid === overview.deck.uuid) && (
                                    <ComboboxDescription>{t("label.on-the-list")}</ComboboxDescription>
                                )}
                            </ComboboxOption>
                        )}
                    </Combobox>
                </Field>
                <Button outline={true} className={"shrink-0"} disabled={deck === null || loading} onClick={onAdd}>
                    <PlusIcon />
                    {t("button.load-deck")}
                </Button>
            </div>
            {added.length > 0 && (
                <ul className={"flex flex-col divide-y divide-zinc-950/5 dark:divide-white/10"}>
                    {added.map((group) => (
                        <li key={group.deck?.uuid} className={"py-1"}>
                            <ProxyGroupRow group={group} count={countOf(group)} onDropDeck={onDropDeck} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
