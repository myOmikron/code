/**
 * Naming the language a card was printed in.
 *
 * A printing is one language — Scryfall gives each its own id — so the language
 * is picked, not typed, and the picker needs a name per code. The names come
 * from the browser rather than from a translation file: there are twenty of
 * them, every one of them already exists in `Intl`, and translating them by
 * hand would mean writing German, English and every future ui language's list
 * of languages out again.
 */

/** Scryfall's codes that are not the ones `Intl` knows */
const BCP_47: Record<string, string> = {
    zhs: "zh-Hans",
    zht: "zh-Hant",
};

/**
 * What a language is called in the ui's own language
 *
 * @param code the language, as Scryfall's code
 * @param uiLanguage the language the app is being read in
 *
 * @returns its name, the code itself for the ones that have none — Phyrexian
 *          is a language of the game, not one `Intl` has ever heard of
 */
export function languageName(code: string, uiLanguage: string): string {
    const tag = BCP_47[code] ?? code;

    try {
        const names = new Intl.DisplayNames([uiLanguage], { type: "language" });
        return names.of(tag) ?? code.toUpperCase();
    } catch {
        return code.toUpperCase();
    }
}
