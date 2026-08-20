/**
 * Which themes the advisor should favour, and which it should avoid.
 *
 * Kept on the device beside the ignore list and the speed override, for the
 * same reason: a preference is a lens on the analysis, not deck content. It
 * must not become something the deck's own history records, and it steers
 * suggestions only — the diagnosis of what a deck *is* must not move because
 * of what its owner would prefer it to be.
 *
 * Theme ids are the service's and the set changes between releases. Nothing
 * here validates against a live list: the service ignores unknown ids with a
 * note, and {@link pruneThemePrefs} retires them once a report says which
 * themes exist now — never from a guess, or a transient failure would wipe
 * real preferences.
 */

/** Where the preferences live, one map for all decks */
const STORAGE_KEY = "cardlens.deck-themes.v1";

/** What the advisor should favour and avoid for one deck */
export type ThemePrefs = {
    /** Themes to steer toward */
    pinned: Array<string>;
    /** Themes to steer away from */
    excluded: Array<string>;
};

/** A deck with no opinion recorded */
export const DEFAULT_THEME_PREFS: ThemePrefs = { pinned: [], excluded: [] };

/** What one theme currently is to the advisor */
export type ThemeState = "neutral" | "pinned" | "excluded";

/**
 * Strings only, deduped, and a theme in both lists keeps the pin.
 *
 * The service resolves the conflict the same way; disagreeing here would make
 * the chips lie about the request that was actually sent.
 *
 * @param prefs the preferences to clean
 *
 * @returns the cleaned preferences
 */
function sanitise(prefs: Partial<ThemePrefs> | undefined): ThemePrefs {
    // Array-checked, not just null-checked: stored JSON is whatever a past
    // release or a hand-edit left behind, and calling `.filter` on a string
    // throws — inside `readAll` that catch would discard *every* deck's
    // preferences over one malformed entry.
    const list = (value: unknown): Array<string> =>
        Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

    const pinned = [...new Set(list(prefs?.pinned))];
    const excluded = [...new Set(list(prefs?.excluded))].filter((id) => !pinned.includes(id));
    return { pinned, excluded };
}

/**
 * Reads every deck's stored preferences, dropping anything malformed
 *
 * @returns the preferences by deck uuid
 */
function readAll(): Record<string, ThemePrefs> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const held: Record<string, ThemePrefs> = {};
        for (const [uuid, prefs] of Object.entries(parsed)) {
            const clean = sanitise(prefs as Partial<ThemePrefs>);
            if (clean.pinned.length > 0 || clean.excluded.length > 0) held[uuid] = clean;
        }
        return held;
    } catch {
        return {};
    }
}

/**
 * Reads one deck's theme preferences
 *
 * @param deckUuid the deck
 *
 * @returns what it favours and avoids
 */
export function readThemePrefs(deckUuid: string): ThemePrefs {
    return readAll()[deckUuid] ?? DEFAULT_THEME_PREFS;
}

/**
 * Stores one deck's theme preferences, dropping the entry when it empties
 *
 * @param deckUuid the deck
 * @param prefs what it should favour and avoid
 */
export function writeThemePrefs(deckUuid: string, prefs: ThemePrefs): void {
    const held = readAll();
    const clean = sanitise(prefs);
    if (clean.pinned.length === 0 && clean.excluded.length === 0) delete held[deckUuid];
    else held[deckUuid] = clean;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(held));
    } catch {
        // Full or unavailable storage costs persistence, not the preference.
    }
}

/**
 * Drops a deleted deck's theme preferences
 *
 * @param deckUuid the deck that is gone
 */
export function forgetThemePrefs(deckUuid: string): void {
    writeThemePrefs(deckUuid, DEFAULT_THEME_PREFS);
}

/**
 * Walks one theme through its three states on a click:
 * neutral → pinned → excluded → neutral.
 *
 * @param prefs the current preferences
 * @param themeId the theme that was clicked
 *
 * @returns the preferences after the click
 */
export function cycleTheme(prefs: ThemePrefs, themeId: string): ThemePrefs {
    const { pinned, excluded } = sanitise(prefs);
    if (pinned.includes(themeId)) {
        return { pinned: pinned.filter((id) => id !== themeId), excluded: [...excluded, themeId] };
    }
    if (excluded.includes(themeId)) {
        return { pinned, excluded: excluded.filter((id) => id !== themeId) };
    }
    return { pinned: [...pinned, themeId], excluded };
}

/**
 * What one theme currently is to the advisor
 *
 * @param prefs the current preferences
 * @param themeId the theme to ask about
 *
 * @returns its state
 */
export function themeState(prefs: ThemePrefs, themeId: string): ThemeState {
    if (prefs.pinned.includes(themeId)) return "pinned";
    if (prefs.excluded.includes(themeId)) return "excluded";
    return "neutral";
}

/**
 * Drops ids the live theme layer no longer knows.
 *
 * Call with the ids from a report the service actually answered — never with
 * a guess, or one failed request would wipe real preferences.
 *
 * @param prefs the stored preferences
 * @param liveIds the themes the service currently knows
 *
 * @returns the preferences with retired themes dropped
 */
export function pruneThemePrefs(prefs: ThemePrefs, liveIds: Array<string>): ThemePrefs {
    const live = new Set(liveIds);
    const { pinned, excluded } = sanitise(prefs);
    return {
        pinned: pinned.filter((id) => live.has(id)),
        excluded: excluded.filter((id) => live.has(id)),
    };
}

/**
 * An order-independent key fragment, so reordering a list is not a new request
 *
 * @param prefs the preferences to key
 *
 * @returns a string equal for equal preferences
 */
export function themePrefsKey(prefs: ThemePrefs): string {
    const { pinned, excluded } = sanitise(prefs);
    return `${[...pinned].sort().join(",")}|${[...excluded].sort().join(",")}`;
}
