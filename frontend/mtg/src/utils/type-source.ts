/**
 * Where the card-type corridors in `deck-advisor-types.tsx` came from.
 *
 * `resolve_type_targets` on the graph service reads a hard ladder of
 * corpora — a commander's cEDH subpage, a pooled cEDH profile, a
 * commander×theme subpage, the plain commander page, a pooled archetype
 * profile, or the hand-authored default — and stamps which one won onto
 * `Diagnostics.type_source` as one auditable string. That used to be true
 * only in the sense that the number happened to differ; now a bracket-5
 * deck silently switches from a commander's casual page to its cEDH one and
 * every target moves, so the reader is owed a line saying why.
 *
 * The string is text meant for logs and tests, not readers — this module is
 * the one place that takes it apart. Parsing rather than pattern-matching in
 * the component keeps the six shapes (and the service's own comment
 * enumerating them, in `type_targets.py`) in one auditable spot, and keeps
 * `deck-advisor-types.tsx` itself free of regular expressions.
 */

/** One of the six corpora `resolve_type_targets` can report, plus its numbers */
export type TypeSourceInfo =
    | { kind: "cedh-page"; slug: string; decks: number }
    | { kind: "cedh-pool"; commanders: number; decks: number }
    | { kind: "theme-page"; slug: string; theme: string; decks: number }
    | { kind: "commander-page"; slug: string }
    | { kind: "archetype"; tag: string; commanders: number; decks: number }
    | { kind: "default" }
    // Not one of the six documented shapes — a service string this build has
    // never seen. Kept rather than dropped: an unrecognised source is still
    // evidence the corpus changed, and saying so beats going silent on it.
    | { kind: "unknown"; raw: string };

// EDHREC decks counts are Python's `f"{n:,}"` — plain digit groups on
// commas, always base-10, so this never needs to understand a locale.
const COUNT = "[\\d,]+";
// `slugify()` (edhrec.py) is NFKD-folded, non-alphanumerics stripped, then
// lowercased — always `[a-z0-9-]+`, and EDHREC's own taglink slugs follow
// the same shape.
const SLUG = "[a-z0-9-]+";

const CEDH_PAGE = new RegExp(`^edhrec:(${SLUG})/cedh \\((${COUNT}) decks\\)$`);
const THEME_PAGE = new RegExp(`^edhrec:(${SLUG})/(${SLUG}) \\((${COUNT}) decks\\)$`);
const COMMANDER_PAGE = new RegExp(`^edhrec:(${SLUG})$`);
const CEDH_POOL = new RegExp(`^cedh-pool \\((\\d+) commanders, (${COUNT}) decks\\)$`);
const ARCHETYPE = new RegExp(`^archetype:(${SLUG}) \\((\\d+) commanders, (${COUNT}) decks\\)$`);

/**
 * Turns a deck count with thousands commas into a number
 *
 * @param text digits and commas, e.g. "39,657"
 *
 * @returns the plain count
 */
function count(text: string): number {
    return Number.parseInt(text.replaceAll(",", ""), 10);
}

/**
 * Classifies a `Diagnostics.type_source` string.
 *
 * `undefined`/`null`/empty all mean the field is absent on the wire — an
 * older report, or a request path that never called `resolve_type_targets`
 * at all — and must read as "nothing to say", never as a fourth falsy case
 * a caller has to remember to check for separately.
 *
 * @param source the raw field, as the service sent it
 *
 * @returns the classified source, or `null` when there is nothing to show
 */
export function parseTypeSource(source: string | null | undefined): TypeSourceInfo | null {
    if (source === null || source === undefined || source === "") return null;
    if (source === "default") return { kind: "default" };

    // Tried before the general theme-page pattern: cEDH's subpage shares its
    // shape exactly (`edhrec:<slug>/<tag> (<n> decks)`, tag "cedh"), so
    // matching theme-page first would read every cEDH-conditioned deck as a
    // deck themed "cedh".
    const cedhPage = CEDH_PAGE.exec(source);
    if (cedhPage !== null) return { kind: "cedh-page", slug: cedhPage[1], decks: count(cedhPage[2]) };

    const cedhPool = CEDH_POOL.exec(source);
    if (cedhPool !== null) {
        return { kind: "cedh-pool", commanders: Number.parseInt(cedhPool[1], 10), decks: count(cedhPool[2]) };
    }

    const themePage = THEME_PAGE.exec(source);
    if (themePage !== null) {
        return { kind: "theme-page", slug: themePage[1], theme: themePage[2], decks: count(themePage[3]) };
    }

    const commanderPage = COMMANDER_PAGE.exec(source);
    if (commanderPage !== null) return { kind: "commander-page", slug: commanderPage[1] };

    const archetype = ARCHETYPE.exec(source);
    if (archetype !== null) {
        return {
            kind: "archetype",
            tag: archetype[1],
            commanders: Number.parseInt(archetype[2], 10),
            decks: count(archetype[3]),
        };
    }

    return { kind: "unknown", raw: source };
}

/**
 * Turns a slug or tag into something worth reading — "atraxa-praetors-voice"
 * to "Atraxa Praetors Voice".
 *
 * A cosmetic pass, not a real name lookup: the source string only ever
 * carries EDHREC's own slug, which drops punctuation the display name had
 * (the apostrophe above), so this is a best-effort label. The exact string
 * stays reachable as the audit trail — see the `title` attribute where this
 * is rendered.
 *
 * @param slug the hyphenated, lower-case slug or tag
 *
 * @returns a space-joined, title-cased approximation of it
 */
export function humanizeSlug(slug: string): string {
    return slug
        .split("-")
        .filter((word) => word.length > 0)
        .map((word) => (/[a-z]/.test(word[0]) ? word[0].toUpperCase() + word.slice(1) : word))
        .join(" ");
}

/** An i18n key under the "advisor" namespace, plus the params it interpolates */
export type TypeSourceLabel = {
    /** The translation key, always under `label.` */
    key: string;
    /** What the key interpolates — humanised names and formatted counts, never a raw slug */
    params: Record<string, string>;
};

/**
 * Formats a deck or commander count the way the rest of the app does — see
 * `set-picker.tsx` and friends. Always "de-DE" grouping regardless of the
 * active language, matching that existing convention rather than inventing
 * a second one here.
 *
 * @param n the count
 *
 * @returns the count with thousands grouped
 */
function grouped(n: number): string {
    return n.toLocaleString("de-DE");
}

/**
 * Picks the translation key and params for a classified type source.
 *
 * Pure and separate from rendering so the six shapes (plus the defensive
 * seventh) can be tested without pulling in i18next — the same split
 * `advisor-phrase.ts` uses for the service's own phrase codes.
 *
 * @param info the classified source
 *
 * @returns the key and params to hand to `t()`
 */
export function typeSourceLabel(info: TypeSourceInfo): TypeSourceLabel {
    switch (info.kind) {
        case "cedh-page":
            return {
                key: "label.type-source-cedh-page",
                params: { commander: humanizeSlug(info.slug), count: grouped(info.decks) },
            };
        case "cedh-pool":
            return {
                key: "label.type-source-cedh-pool",
                params: { commanders: grouped(info.commanders), count: grouped(info.decks) },
            };
        case "theme-page":
            return {
                key: "label.type-source-theme-page",
                params: {
                    commander: humanizeSlug(info.slug),
                    theme: humanizeSlug(info.theme),
                    count: grouped(info.decks),
                },
            };
        case "commander-page":
            return {
                key: "label.type-source-commander-page",
                params: { commander: humanizeSlug(info.slug) },
            };
        case "archetype":
            return {
                key: "label.type-source-archetype",
                params: {
                    archetype: humanizeSlug(info.tag),
                    commanders: grouped(info.commanders),
                    count: grouped(info.decks),
                },
            };
        case "default":
            return { key: "label.type-source-default", params: {} };
        case "unknown":
            return { key: "label.type-source-unknown", params: { raw: info.raw } };
    }
}
