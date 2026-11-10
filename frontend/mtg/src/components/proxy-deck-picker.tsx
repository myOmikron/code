import { PlusIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Combobox,
    ComboboxDescription,
    ComboboxLabel,
    ComboboxOption,
    Description,
    Field,
    Label,
    Switch,
    SwitchField,
} from "components";
import { useTranslation } from "react-i18next";
import type { ProxyPicks } from "src/utils/use-proxy-picks";

/**
 * The properties for {@link ProxyDeckPicker}
 */
export type ProxyDeckPickerProps = {
    /** The list a deck is added to; adding one already on it tops it up */
    picks: ProxyPicks;
};

/**
 * Picks one more deck for a proxy list, with all its lines or only the copies
 * its Physical deck lacks.
 *
 * @returns the combobox, its button and the switch between the two
 */
export function ProxyDeckPicker({ picks }: ProxyDeckPickerProps) {
    const [t] = useTranslation("game-utils");

    return (
        <div className={"flex flex-col gap-3"}>
            <div className={"flex gap-2 max-sm:flex-col sm:items-end"}>
                <Field className={"min-w-0 flex-1"}>
                    <Label>{t("label.deck")}</Label>
                    <Combobox
                        options={picks.decks}
                        value={picks.deck}
                        onChange={(chosen) => picks.setDeck(chosen)}
                        placeholder={t("label.search-deck")}
                        displayValue={(overview) => overview?.deck.name ?? ""}
                    >
                        {(overview) => (
                            <ComboboxOption value={overview}>
                                <ComboboxLabel>{overview.deck.name}</ComboboxLabel>
                                {picks.groups.some((group) => group.deck?.uuid === overview.deck.uuid) && (
                                    <ComboboxDescription>{t("label.on-the-list")}</ComboboxDescription>
                                )}
                            </ComboboxOption>
                        )}
                    </Combobox>
                </Field>
                <Button
                    outline={true}
                    className={"shrink-0 max-sm:w-full"}
                    disabled={picks.deck === null || picks.loading}
                    onClick={picks.addChosenDeck}
                >
                    <PlusIcon />
                    {t("button.load-deck")}
                </Button>
            </div>
            <SwitchField>
                <Label>{t("label.only-missing")}</Label>
                <Description>{t("description.only-missing")}</Description>
                <Switch color={"lime"} checked={picks.onlyMissing} onChange={picks.setOnlyMissing} />
            </SwitchField>
        </div>
    );
}
