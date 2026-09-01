import type { ScanLanguage } from "src/scanner/scan-client";

/**
 * The languages cards are printed in, under their own names.
 *
 * Their own names on purpose: someone looking for their Japanese stack finds 日本語 faster than a
 * translation of it, and the list then needs no upkeep in either locale.
 */
export const CARD_LANGUAGES: { code: ScanLanguage; label: string }[] = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
    { code: "it", label: "Italiano" },
    { code: "pt", label: "Português" },
    { code: "ja", label: "日本語" },
    { code: "zhs", label: "简体中文" },
    { code: "zht", label: "繁體中文" },
    { code: "ko", label: "한국어" },
    { code: "ru", label: "Русский" },
];

/**
 * Names a language code, falling back to the code itself.
 *
 * The catalogue carries a few languages nobody prints stacks of, Phyrexian and Quenya among them,
 * and a card in one of those should still say something rather than nothing.
 *
 * @param code as the catalogue writes it
 * @returns the language's own name
 */
export function cardLanguageLabel(code: string): string {
    return CARD_LANGUAGES.find((entry) => entry.code === code)?.label ?? code.toUpperCase();
}
