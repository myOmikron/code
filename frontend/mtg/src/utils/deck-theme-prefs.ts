/**
 * Which themes the advisor should favour, and which it should avoid.
 *
 * The document type and the pure logic around it — cycling a theme through
 * its states, retiring one the service no longer knows, keying a request on
 * the pair. The preference itself now lives on the server as part of
 * {@link AdvisorSettings} (`advisor-settings.ts`); this module holds what
 * both that document and the panels that edit it need, and nothing that
 * talks to storage or the network.
 *
 * Theme ids are the service's and the set changes between releases. Nothing
 * here validates against a live list: the service ignores unknown ids with a
 * note, and {@link pruneThemePrefs} retires them once a report says which
 * themes exist now — never from a guess, or a transient failure would wipe
 * real preferences.
 */

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
    // Array-checked, not just null-checked: the server hands back whatever
    // was last written, and a stale client or a hand-edited request could
    // still leave something malformed here — calling `.filter` on a string
    // throws, and this is the one place that has to survive it.
    const list = (value: unknown): Array<string> =>
        Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

    const pinned = [...new Set(list(prefs?.pinned))];
    const excluded = [...new Set(list(prefs?.excluded))].filter((id) => !pinned.includes(id));
    return { pinned, excluded };
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
