import { createFileRoute } from "@tanstack/react-router";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import {
    Description,
    Divider,
    HorizontalField,
    HorizontalFieldDivider,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    Subheading,
    Switch,
    notify,
} from "components";
import type { Lang } from "components";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CardmarketSettings } from "src/components/cardmarket-settings";
import { foilTiltEnabled, foilTiltSupported, setFoilTilt, subscribeFoilTilt } from "src/utils/foil-tilt";
import { applyTheme, currentTheme } from "src/utils/theme";
import type { Theme } from "src/utils/theme";

/** How long a toast stays up that has a browser setting to find in it */
const HINT_SHOWN = 10_000;

export const Route = createFileRoute("/_menu/profile/_profile/settings")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t, i18n] = useTranslation("profile");
    const [tg] = useTranslation();
    const [theme, setTheme] = useState<Theme>(currentTheme);
    const tilt = useSyncExternalStore(subscribeFoilTilt, foilTiltEnabled);
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
     * Turns the tilting sheen on or off.
     *
     * Switching it on is also what asks iOS for the motion sensor, and the
     * prompt can be refused — the switch then stays where it was, which without
     * a word would read as the app ignoring the tap. A browser that blocks the
     * sensor instead of refusing it, as Brave does out of the box, says nothing
     * at all: the switch goes on and no card ever moves, so that case gets a
     * message of its own.
     *
     * @param wanted what the switch was moved to
     */
    async function changeTilt(wanted: boolean) {
        const result = await setFoilTilt(wanted);
        // Both of these are instructions to go somewhere else and change
        // something, not a "saved" that has been read by the time it fades.
        if (result === "denied") notify.error(t("toast.foil-tilt-denied"), { autoClose: HINT_SHOWN });
        if (result === "silent") notify.error(t("toast.foil-tilt-silent"), { autoClose: HINT_SHOWN });
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
            <Subheading>{t("heading.display")}</Subheading>
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

            {foilTiltSupported() && (
                <HorizontalField>
                    <Label>{t("label.foil-tilt")}</Label>
                    <Description>{t("description.foil-tilt")}</Description>
                    <HorizontalFieldDivider />
                    <Switch color={"blue"} checked={tilt} onChange={(wanted) => void changeTilt(wanted)} />
                </HorizontalField>
            )}

            <HorizontalField>
                <Label>{t("label.language")}</Label>
                <Description>{t("description.language")}</Description>
                <HorizontalFieldDivider />
                {/* The library ships a `LanguageSelect`, but its labels live inside
                    the library, where this app's translation scanner cannot see
                    them and drops them as unused. Spelled out here instead. */}
                <Listbox value={lang} onChange={changeLanguage}>
                    <ListboxOption value={"EN"} className={"gap-3"}>
                        🇺🇸
                        <ListboxLabel>{tg("label.english")}</ListboxLabel>
                    </ListboxOption>
                    <ListboxOption value={"DE"} className={"gap-3"}>
                        🇩🇪
                        <ListboxLabel>{tg("label.german")}</ListboxLabel>
                    </ListboxOption>
                </Listbox>
            </HorizontalField>

            <Divider />

            <CardmarketSettings />
        </div>
    );
}
