/**
 * One reader's advisor settings for one deck, as the app uses them.
 *
 * The six things the advisor used to keep in `localStorage`, now one document
 * on the server: which themes to argue for, the shape to grade against, what
 * a card may cost, the cards never to offer, the cards never to cut, and
 * whether the reader has been asked any of it yet. {@link useAdvisorSettings}
 * is what reads and writes this document; this module only holds the shape
 * and the conversions to and from the wire.
 *
 * The generated client's `ThemePrefs`/`DeckTargets` carry optional fields —
 * `pinned?`, `buckets?`, and so on — because the server accepts a document
 * with any of them left out. The app's own copies of these types (in
 * `deck-theme-prefs.ts` and `deck-targets.ts`) keep them required, which is
 * what every reader of a `DeckTargets` or `ThemePrefs` in this codebase
 * already assumes. {@link fromResponse} is the one place that gap is closed.
 */

import { AdvisorSettingsResponse, MarkedCard, SetAdvisorSettingsRequest } from "src/api/generated";
import { Corridor, DEFAULT_TARGETS, DeckTargets, heldTargets } from "src/utils/deck-targets";
import {
    DEFAULT_THEME_PREFS,
    ThemePrefs,
    ThemeState,
    cycleTheme,
    pruneThemePrefs,
    themePrefsKey,
    themeState,
} from "src/utils/deck-theme-prefs";

/** A card the advisor must never offer again — the ignore list's own entry */
export type IgnoredCard = MarkedCard;

/** A card the advisor must stop proposing as a cut — the keep list's own entry */
export type KeptCard = MarkedCard;

/** Everything the advisor knows about this deck for this reader */
export type AdvisorSettings = {
    /** Which themes to argue for and which to avoid */
    themes: ThemePrefs;
    /** The shape the deck is graded against, where it was moved */
    targets: DeckTargets;
    /** The restriction on what may be suggested at all, `null` for the whole pool */
    pool_query: string | null;
    /** Cards the advisor must never offer */
    ignored: Array<IgnoredCard>;
    /** Cards the advisor must never propose cutting */
    kept: Array<KeptCard>;
    /** Whether the reader has been through the advisor's questions */
    setup_done: boolean;
};

/** A deck nobody has advised yet — every list empty, nothing graded, nothing asked */
export const DEFAULT_ADVISOR_SETTINGS: AdvisorSettings = {
    themes: DEFAULT_THEME_PREFS,
    targets: DEFAULT_TARGETS,
    pool_query: null,
    ignored: [],
    kept: [],
    setup_done: false,
};

/**
 * Normalises the server's document into the shape the rest of the app uses.
 *
 * The two mismatches are absorbed here rather than at every call site: the
 * generated maps come back as `{ [k: string]: Corridor | undefined }` where
 * the app's `DeckTargets` wants `Record<string, Corridor>`, and `pinned` /
 * `excluded` are optional where the app treats them as always-present arrays.
 *
 * The corridors are also held to what the graph service will take, so a deck
 * that stored a wider one before that ceiling existed comes back readable
 * instead of drawing a target of several thousand cards.
 *
 * @param response what the server answered
 *
 * @returns the settings, in the app's own shape
 */
export function fromResponse(response: AdvisorSettingsResponse): AdvisorSettings {
    return {
        themes: {
            pinned: response.themes.pinned ?? [],
            excluded: response.themes.excluded ?? [],
        },
        targets: heldTargets({
            buckets: (response.targets.buckets ?? {}) as Record<string, Corridor>,
            types: (response.targets.types ?? {}) as Record<string, Corridor>,
            curve: response.targets.curve ?? null,
        }),
        pool_query: response.pool_query ?? null,
        ignored: response.ignored,
        kept: response.kept,
        setup_done: response.setup_done,
    };
}

/**
 * The settings as the server's whole-document `PUT` takes them.
 *
 * @param settings what to write
 *
 * @returns the request body
 */
export function toRequest(settings: AdvisorSettings): SetAdvisorSettingsRequest {
    return {
        themes: settings.themes,
        targets: settings.targets,
        pool_query: settings.pool_query,
        ignored: settings.ignored,
        kept: settings.kept,
        setup_done: settings.setup_done,
    };
}

// Re-exported so a caller that already imports the settings document from
// here does not also need a second import from `deck-theme-prefs` for the
// pure helpers that work on its `themes` slice.
export { DEFAULT_THEME_PREFS, cycleTheme, pruneThemePrefs, themePrefsKey, themeState };
export type { ThemePrefs, ThemeState };
