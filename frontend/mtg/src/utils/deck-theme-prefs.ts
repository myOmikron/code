/**
 * How much of each theme the advisor should argue for — or against.
 *
 * The document type and the pure logic around it; the preference itself lives
 * on the server as part of {@link AdvisorSettings} (`advisor-settings.ts`),
 * which also reads a document stored before levels existed back as levels.
 */

/**
 * How much of a theme the deck should hold, in the four steps the panel
 * offers.
 *
 * Steps rather than a number because a number needs a denominator the
 * reader does not have in their head. Each step is a share of the deck's
 * non-land cards, see {@link THEME_LEVEL_SHARE}; the service turns that into
 * cards against the deck it is looking at and argues for the difference.
 */
export type ThemeLevel = "avoid" | "light" | "core" | "allin";

/** The levels in the order the control shows them, least to most */
export const THEME_LEVELS: ReadonlyArray<ThemeLevel> = ["avoid", "light", "core", "allin"];

/**
 * The share of the non-land cards each level asks for.
 *
 * Zero is today's exclusion. A tenth is a touch — six cards of a Commander
 * deck's sixty-odd spells. A quarter is a strand the deck is built around,
 * and forty percent is the plan: the built Elf and tokens lists the theme
 * detector was calibrated on put 47 to 51 cards behind their top theme.
 */
export const THEME_LEVEL_SHARE: Record<ThemeLevel, number> = { avoid: 0, light: 0.1, core: 0.25, allin: 0.4 };

/** What the advisor should favour and avoid for one deck */
export type ThemePrefs = {
    /** How much of each theme the deck should hold, by theme id */
    levels: Record<string, ThemeLevel>;
};

/** A deck with no opinion recorded */
export const DEFAULT_THEME_PREFS: ThemePrefs = { levels: {} };

/**
 * Whether a value names a level
 *
 * @param value whatever was stored
 *
 * @returns the type guard
 */
function isLevel(value: unknown): value is ThemeLevel {
    return typeof value === "string" && (THEME_LEVELS as ReadonlyArray<string>).includes(value);
}

/**
 * Whatever the server handed back, as a well-formed preference: anything
 * that is not a level is dropped.
 *
 * @param levels the stored levels
 *
 * @returns the cleaned preferences
 */
export function normaliseThemePrefs(levels: Record<string, unknown> | undefined): ThemePrefs {
    const kept: Record<string, ThemeLevel> = {};
    for (const [id, level] of Object.entries(levels ?? {})) {
        if (isLevel(level)) kept[id] = level;
    }
    return { levels: kept };
}

/**
 * The themes the deck is played for: every one at `light` or above
 *
 * @param prefs the current preferences
 *
 * @returns their ids
 */
export function playedThemes(prefs: ThemePrefs): Array<string> {
    return Object.keys(prefs.levels).filter((id) => prefs.levels[id] !== "avoid");
}

/**
 * Sets one theme's level, or clears it
 *
 * @param prefs the current preferences
 * @param themeId the theme that was set
 * @param level its new level, or `null` to hold no opinion about it
 *
 * @returns the preferences after the change
 */
export function withThemeLevel(prefs: ThemePrefs, themeId: string, level: ThemeLevel | null): ThemePrefs {
    const levels = { ...prefs.levels };
    if (level === null) delete levels[themeId];
    else levels[themeId] = level;
    return { levels };
}

/**
 * Records the set of themes the deck is *played* for, as the setup wizard
 * asks it.
 *
 * A picked theme without a level lands on `core`; one already argued for
 * keeps its level, since the wizard never asked how much. A theme that was
 * argued for and is no longer picked loses its level — the wizard opened on
 * the current picks and hands back the whole answer, so an unticked theme is
 * meant to be gone. Avoided themes are left alone — they are the other half
 * of the conversation and the wizard did not ask about them.
 *
 * @param prefs the current preferences
 * @param picked the themes the deck plays
 *
 * @returns the preferences after the change
 */
export function withThemesPicked(prefs: ThemePrefs, picked: Array<string>): ThemePrefs {
    const levels: Record<string, ThemeLevel> = {};
    for (const [id, level] of Object.entries(prefs.levels)) {
        if (level === "avoid" && !picked.includes(id)) levels[id] = level;
    }
    for (const id of picked) {
        const held = prefs.levels[id];
        levels[id] = held === undefined || held === "avoid" ? "core" : held;
    }
    return { levels };
}

/**
 * The target share of the non-land cards per theme, as the graph service
 * reads it — every theme with a level, `avoid` included at zero
 *
 * @param prefs the current preferences
 *
 * @returns theme id to share, 0 to 1
 */
export function themeTargets(prefs: ThemePrefs): Record<string, number> {
    return Object.fromEntries(Object.entries(prefs.levels).map(([id, level]) => [id, THEME_LEVEL_SHARE[level]]));
}

/**
 * How many cards a level asks for in a deck of this many non-land cards
 *
 * @param level the level
 * @param spells the deck's non-land count
 *
 * @returns the cards, half rounded up — the service's `resolve_theme_targets` rounds the same way
 */
export function themeTargetCards(level: ThemeLevel, spells: number): number {
    return Math.round(THEME_LEVEL_SHARE[level] * Math.max(0, spells));
}

/**
 * An order-independent key fragment, so reordering is not a new request
 *
 * @param prefs the preferences to key
 *
 * @returns a string equal for equal preferences
 */
export function themePrefsKey(prefs: ThemePrefs): string {
    return Object.keys(prefs.levels)
        .sort()
        .map((id) => `${id}=${prefs.levels[id]}`)
        .join(",");
}
