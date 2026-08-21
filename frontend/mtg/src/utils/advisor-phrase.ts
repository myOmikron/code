import { TFunction } from "i18next";
import { Phrase, Provenance } from "src/api/graph-generated";

/**
 * Wording the graph service's sentences in the reader's language.
 *
 * The service composes every reason, provenance line and note as a `{code,
 * params, text}` triple: `code` and `params` are what a localised UI keys off,
 * and `text` is the English rendering the service would have sent on its own.
 *
 * The fallback is the point. Codes are added server-side and this app ships
 * separately, so a release will eventually meet a code it has no key for — and
 * an English sentence is a far better answer there than a raw key printed at
 * the reader. i18next's `defaultValue` does exactly that, so a missing key
 * degrades to what the old wire format always sent.
 *
 * Interpolation is off: the service has already substituted the numbers into
 * `text`, and asking i18next to interpolate the fallback would leave `{{count}}`
 * on screen for any key that is missing.
 */

/** How a phrase's code becomes a translation key, per translation category */
type Namespace = "cut" | "why" | "note";

/**
 * Words one phrase from the graph service.
 *
 * @param t the advisor namespace's translator
 * @param kind which family of strings this belongs to
 * @param phrase the phrase to word
 *
 * @returns the translated sentence, or the service's English if the key is new
 */
export function say(t: TFunction, kind: Namespace, phrase: Phrase): string {
    const category = kind === "note" ? "description" : "label";
    return t(`${category}.${kind}-${phrase.code}`, {
        ...phrase.params,
        defaultValue: phrase.text,
    });
}

/**
 * Words a provenance entry, which carries its code alongside a legacy `detail`.
 *
 * A channel that has not been given a code yet still renders — as the English
 * it has always rendered as — rather than keying off an empty string.
 *
 * @param t the advisor namespace's translator
 * @param source the provenance entry to word
 *
 * @returns the translated line, or the service's English
 */
export function sayWhy(t: TFunction, source: Provenance): string {
    if (source.code === undefined || source.code === "") return source.detail;
    return say(t, "why", { code: source.code, params: source.params, text: source.detail });
}
