/**
 * Naming the languages a watched card can be narrowed to.
 *
 * Scryfall gives every language its own printing, so a language is not a
 * property a row can carry on its own — it is a set of printings the row
 * accepts. That only means anything while the printing is *not* pinned, which
 * is why nothing here is reachable from a row that names one.
 */

import { useTranslation } from "react-i18next";

/**
 * The codes offered, in the order they are listed.
 *
 * The languages Cardmarket grades separately, which is the same set the shop
 * links already filter by — a language this app can narrow to but that shop
 * cannot would be a promise it could not keep.
 */
export const WATCH_LANGUAGES = ["en", "de", "es", "fr", "it", "ja", "ko", "pt", "ru", "zhs", "zht"] as const;

/** One of the languages a watch list entry can be narrowed to */
export type WatchLanguage = (typeof WATCH_LANGUAGES)[number];

/**
 * Names for the languages a watch list row can be held to
 *
 * @returns one naming function per shape the badge and the picker need
 */
export function useWatchLanguageLabels() {
    const [t] = useTranslation("watch-list");

    /**
     * What a language code is called
     *
     * @param code the code to name
     *
     * @returns the name, or the code upper-cased where none is known
     */
    function language(code: string): string {
        const known = WATCH_LANGUAGES.find((offered) => offered === code);
        switch (known) {
            case "en":
                return t("label.language-en");
            case "de":
                return t("label.language-de");
            case "es":
                return t("label.language-es");
            case "fr":
                return t("label.language-fr");
            case "it":
                return t("label.language-it");
            case "ja":
                return t("label.language-ja");
            case "ko":
                return t("label.language-ko");
            case "pt":
                return t("label.language-pt");
            case "ru":
                return t("label.language-ru");
            case "zhs":
                return t("label.language-zhs");
            case "zht":
                return t("label.language-zht");
            case undefined:
                return code.toUpperCase();
        }
    }

    return {
        language,
        /**
         * What the badge says about a set of languages.
         *
         * Named while there is room to name them and counted once there is
         * not: two codes fit a badge, and past that the number is more use
         * than a list truncated mid-word.
         *
         * @param languages the codes in force, empty for any
         *
         * @returns the label
         */
        languages: (languages: Array<string>): string => {
            if (languages.length === 0) return t("label.any-language");
            if (languages.length <= 2) return languages.map(language).join(", ");
            return t("label.languages-count", { count: languages.length });
        },
    };
}
