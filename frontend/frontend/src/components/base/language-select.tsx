import React from "react";
import { Listbox, ListboxLabel, ListboxOption } from "src/components/base/listbox";
import { useTranslation } from "react-i18next";

/** The available languages */
export type Lang = "DE" | "EN";

/**
 * The properties for {@link LanguageSelect}
 */
export type LanguageSelectProps = {
    /** The current language */
    lang: Lang;
    /** The langauge that was set */
    setLang: (lang: Lang) => void;
};

/**
 * A listbox that let the user choose a language
 */
export default function LanguageSelect(props: LanguageSelectProps) {
    const { lang, setLang } = props;

    const [tg] = useTranslation();

    return (
        <Listbox value={lang} onChange={(e) => setLang(e)}>
            <ListboxOption value={"EN"} className={"gap-3"}>
                🇺🇸
                <ListboxLabel>{tg("label.english")}</ListboxLabel>
            </ListboxOption>
            <ListboxOption value={"DE"} className={"gap-3"}>
                🇩🇪
                <ListboxLabel>{tg("label.german")}</ListboxLabel>
            </ListboxOption>
        </Listbox>
    );
}
