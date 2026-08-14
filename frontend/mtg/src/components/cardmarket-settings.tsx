import {
    Description,
    HorizontalField,
    HorizontalFieldDivider,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Subheading,
    Switch,
} from "components";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { CardCondition } from "src/api/generated";
import { CONDITION_ORDER, conditionLabel } from "src/components/card-attribute-badge";
import {
    CARDMARKET_REGIONS,
    SELLER_COUNTRIES,
    cardmarketSettings,
    saveCardmarketSettings,
    subscribeCardmarketSettings,
} from "src/utils/cardmarket";
import type { CardmarketSettings as Settings } from "src/utils/cardmarket";

/** The country pages, named the way that page names itself */
const REGION_LABELS: Record<(typeof CARDMARKET_REGIONS)[number], string> = {
    de: "Deutsch",
    en: "English",
    fr: "Français",
    it: "Italiano",
    es: "Español",
};

/** Stands in for "no country chosen": a listbox needs a value, `null` is not one */
const ANY_COUNTRY = 0;

/**
 * What the Cardmarket links do, and where they land.
 *
 * The links themselves sit on every card in a collection; this is the one place
 * that decides what they carry. Kept in this browser, like the theme; see
 * `src/utils/cardmarket.ts`.
 *
 * @returns the settings section
 */
export function CardmarketSettings() {
    const [t, i18n] = useTranslation("profile");
    const [tg] = useTranslation();
    const settings = useSyncExternalStore(subscribeCardmarketSettings, cardmarketSettings);

    // Country names come from the browser rather than from the translation
    // files: thirty-five names in two languages is a table nobody would keep
    // current, and the platform ships one.
    const countryNames = new Intl.DisplayNames([i18n.resolvedLanguage ?? "en"], { type: "region" });
    const countries = SELLER_COUNTRIES.map((country) => ({
        ...country,
        name: countryNames.of(country.code) ?? country.code,
    })).sort((one, other) => one.name.localeCompare(other.name, i18n.resolvedLanguage));

    /**
     * Writes one changed field, keeping the rest
     *
     * @param change the field to change
     */
    function change(change: Partial<Settings>) {
        saveCardmarketSettings({ ...settings, ...change });
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <Subheading>{t("heading.cardmarket")}</Subheading>
            <HorizontalField>
                <Label>{t("label.cardmarket-region")}</Label>
                <Description>{t("description.cardmarket-region")}</Description>
                <HorizontalFieldDivider />
                <Listbox value={settings.region} onChange={(region) => change({ region })}>
                    {CARDMARKET_REGIONS.map((region) => (
                        <ListboxOption key={region} value={region}>
                            <ListboxLabel>{REGION_LABELS[region]}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </HorizontalField>

            <HorizontalField>
                <Label>{t("label.cardmarket-language")}</Label>
                <Description>{t("description.cardmarket-language")}</Description>
                <HorizontalFieldDivider />
                <Switch
                    color={"blue"}
                    checked={settings.matchLanguage}
                    onChange={(matchLanguage) => change({ matchLanguage })}
                />
            </HorizontalField>

            <HorizontalField>
                <Label>{t("label.cardmarket-finish")}</Label>
                <Description>{t("description.cardmarket-finish")}</Description>
                <HorizontalFieldDivider />
                <Switch
                    color={"blue"}
                    checked={settings.matchFinish}
                    onChange={(matchFinish) => change({ matchFinish })}
                />
            </HorizontalField>

            <HorizontalField>
                <Label>{t("label.cardmarket-condition")}</Label>
                <Description>{t("description.cardmarket-condition")}</Description>
                <HorizontalFieldDivider />
                <Listbox
                    value={settings.minCondition ?? ""}
                    onChange={(value) => change({ minCondition: value === "" ? null : (value as CardCondition) })}
                >
                    <ListboxOption value={""}>
                        <ListboxLabel>{t("label.cardmarket-any")}</ListboxLabel>
                    </ListboxOption>
                    {CONDITION_ORDER.map((condition) => (
                        <ListboxOption key={condition} value={condition}>
                            <ListboxLabel>{conditionLabel(tg, condition)}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </HorizontalField>

            <HorizontalField>
                <Label>{t("label.cardmarket-seller-country")}</Label>
                <Description>{t("description.cardmarket-seller-country")}</Description>
                <HorizontalFieldDivider />
                <Listbox
                    value={settings.sellerCountry ?? ANY_COUNTRY}
                    onChange={(value) => change({ sellerCountry: value === ANY_COUNTRY ? null : value })}
                >
                    <ListboxOption value={ANY_COUNTRY}>
                        <ListboxLabel>{t("label.cardmarket-anywhere")}</ListboxLabel>
                    </ListboxOption>
                    {countries.map((country) => (
                        <ListboxOption key={country.id} value={country.id}>
                            <ListboxLabel>{country.name}</ListboxLabel>
                        </ListboxOption>
                    ))}
                </Listbox>
            </HorizontalField>
        </div>
    );
}
