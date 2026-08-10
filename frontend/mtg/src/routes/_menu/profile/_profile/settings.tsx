import { createFileRoute } from "@tanstack/react-router";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import {
    Description,
    Divider,
    HorizontalField,
    HorizontalFieldDivider,
    Label,
    LanguageSelect,
    Listbox,
    ListboxLabel,
    ListboxOption,
} from "components";
import type { Lang } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { applyTheme, currentTheme } from "src/utils/theme";
import type { Theme } from "src/utils/theme";

export const Route = createFileRoute("/_menu/profile/_profile/settings")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t, i18n] = useTranslation("profile");
    const [theme, setTheme] = useState<Theme>(currentTheme);
    // `resolvedLanguage` rather than `language`: a browser reporting `de-DE`
    // gets served `de`, and it is the served one the listbox has to agree with.
    const [lang, setLang] = useState<Lang>((i18n.resolvedLanguage ?? "").startsWith("de") ? "DE" : "EN");

    /**
     * Switches the theme over and remembers it
     *
     * @param chosen the new theme
     */
    function change(chosen: Theme) {
        setTheme(chosen);
        applyTheme(chosen);
    }

    /**
     * Switches the language over.
     *
     * The detector caches the choice in `localStorage` by itself, so there is
     * nothing to store here — but the document's own `lang` is not i18next's to
     * set, and screen readers and hyphenation both go by it.
     *
     * @param chosen the new language
     */
    function changeLanguage(chosen: Lang) {
        setLang(chosen);
        void i18n.changeLanguage(chosen.toLowerCase());
        document.documentElement.lang = chosen.toLowerCase();
    }

    return (
        <div className={"flex flex-col gap-8"}>
            <HorizontalField>
                <Label>{t("label.theme")}</Label>
                <Description>{t("description.theme")}</Description>
                <HorizontalFieldDivider />
                <Listbox value={theme} onChange={change}>
                    <ListboxOption value={"system"}>
                        <ComputerDesktopIcon />
                        <ListboxLabel>{t("label.theme-system")}</ListboxLabel>
                    </ListboxOption>
                    <ListboxOption value={"light"}>
                        <SunIcon />
                        <ListboxLabel>{t("label.theme-light")}</ListboxLabel>
                    </ListboxOption>
                    <ListboxOption value={"dark"}>
                        <MoonIcon />
                        <ListboxLabel>{t("label.theme-dark")}</ListboxLabel>
                    </ListboxOption>
                </Listbox>
            </HorizontalField>

            <Divider soft={true} />

            <HorizontalField>
                <Label>{t("label.language")}</Label>
                <Description>{t("description.language")}</Description>
                <HorizontalFieldDivider />
                <LanguageSelect lang={lang} setLang={changeLanguage} />
            </HorizontalField>
        </div>
    );
}
