/**
 * Release notes: what each Release of mtg changed for players.
 *
 * One YAML fragment per Release note, in `release-notes/unreleased/` until a
 * Release files them under `release-notes/<version>/` next to its
 * `release.yaml`. The fragments are read at build time (see
 * {@link "src/utils/release-notes-parse"}); this module orders the Releases and
 * decides about the unread dot. Reading storage happens elsewhere.
 */

/** What a Release note tells about, in the order the page shows them */
export const RELEASE_NOTE_KINDS = ["new", "improved", "fixed"] as const;

/** What a Release note tells about */
export type ReleaseNoteKind = (typeof RELEASE_NOTE_KINDS)[number];

/** The folder of the pending Release notes, and the version a dev build shows them under */
export const UNRELEASED = "unreleased";

/** A released version, `major.minor.patch` */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** One change players notice, told in both languages */
export type ReleaseNote = {
    /** The fragment's file name, which orders the notes within a kind */
    file: string;
    /** What the note tells about */
    kind: ReleaseNoteKind;
    /** The German text */
    de: string;
    /** The English text */
    en: string;
};

/** One Release with its notes */
export type Release = {
    /** The version without the tag's `v`, or {@link UNRELEASED} */
    version: string;
    /** The Release date as `YYYY-MM-DD`, `null` while unreleased */
    date: string | null;
    /** The notes of each kind, ordered by file name */
    notes: Record<ReleaseNoteKind, Array<ReleaseNote>>;
};

/**
 * Orders two versions the way semver does for `major.minor.patch`, with
 * {@link UNRELEASED} newer than any version
 *
 * @param a one version
 * @param b the other version
 *
 * @returns negative when `a` is older, positive when newer, zero when equal
 */
export function compareVersions(a: string, b: string): number {
    if (a === UNRELEASED || b === UNRELEASED) return Number(a === UNRELEASED) - Number(b === UNRELEASED);
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let part = 0; part < 3; part++) {
        if (left[part] !== right[part]) return left[part] - right[part];
    }
    return 0;
}

/**
 * The Releases the "What's new" page shows.
 *
 * @param releases every Release read from the fragments
 * @param dev whether this is a dev build, the only one that shows the pending notes
 *
 * @returns the Releases with notes, newest first
 */
export function displayedReleases(releases: Array<Release>, dev: boolean): Array<Release> {
    return releases
        .filter((release) => dev || release.version !== UNRELEASED)
        .filter((release) => RELEASE_NOTE_KINDS.some((kind) => release.notes[kind].length > 0))
        .sort((a, b) => compareVersions(b.version, a.version));
}

/** Whether the menu shows the unread dot, and what to remember as seen */
export type Unread = {
    /** Whether there are Release notes the player has not seen */
    dot: boolean;
    /** The Release to remember as the last one seen, `null` to leave the stored one */
    store: string | null;
};

/**
 * Decides about the unread dot on the "What's new" menu entry.
 *
 * @param lastSeen the Release remembered as the last one seen, `null` on a first visit
 * @param releases the displayed Releases, see {@link displayedReleases}
 * @param version the version of the running build
 *
 * @returns whether to show the dot, and what to remember
 */
export function unreadReleaseNotes(lastSeen: string | null, releases: Array<Release>, version: string): Unread {
    if (lastSeen === null || !isVersion(lastSeen)) return { dot: false, store: seenReleaseNotes(releases, version) };
    return { dot: releases.some((release) => compareVersions(release.version, lastSeen) > 0), store: null };
}

/**
 * The Release to remember once the player has seen every note, on opening the
 * page or silently on a first visit
 *
 * @param releases the displayed Releases, see {@link displayedReleases}
 * @param version the version of the running build
 *
 * @returns the newest of the running build and the displayed Releases
 */
export function seenReleaseNotes(releases: Array<Release>, version: string): string {
    const newest = releases[0]?.version;
    return newest !== undefined && compareVersions(newest, version) > 0 ? newest : version;
}

/**
 * Whether a value is a version {@link compareVersions} can order
 *
 * @param value the value, e.g. read back from storage
 *
 * @returns `true` for `major.minor.patch` and {@link UNRELEASED}
 */
function isVersion(value: string): boolean {
    return value === UNRELEASED || VERSION_PATTERN.test(value);
}
