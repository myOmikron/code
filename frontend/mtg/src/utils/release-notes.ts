/**
 * Release notes: what each Release of mtg changed for players.
 *
 * One YAML fragment per Release note, in `release-notes/unreleased/` until a
 * Release files them under `release-notes/<version>/` next to its
 * `release.yaml`. This module only turns their text into Releases and decides
 * about the unread dot; bundling the files and reading storage happen elsewhere.
 */

import { parse } from "yaml";

/** What a Release note tells about, in the order the page shows them */
export const RELEASE_NOTE_KINDS = ["new", "improved", "fixed"] as const;

/** What a Release note tells about */
export type ReleaseNoteKind = (typeof RELEASE_NOTE_KINDS)[number];

/** The folder of the pending Release notes, and the version a dev build shows them under */
export const UNRELEASED = "unreleased";

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

/** The Releases read from the fragments, and everything wrong with them */
export type ParsedReleaseNotes = {
    /** Every Release with its valid notes */
    releases: Array<Release>;
    /** One message per problem, naming the file */
    errors: Array<string>;
};

/**
 * Reads the release-notes directory.
 *
 * @param files every fragment and `release.yaml`, keyed by a path ending in `<folder>/<file>`
 *
 * @returns the Releases and every validation error at once
 */
export function parseReleaseNotes(files: Record<string, string>): ParsedReleaseNotes {
    const folders = new Map<string, Map<string, string>>();
    for (const [path, content] of Object.entries(files)) {
        const [folder, file] = path.split("/").slice(-2);
        const contents = folders.get(folder) ?? new Map<string, string>();
        contents.set(file, content);
        folders.set(folder, contents);
    }

    const releases: Array<Release> = [];
    const errors: Array<string> = [];
    for (const folder of [...folders.keys()].sort()) {
        const contents = folders.get(folder) ?? new Map<string, string>();
        const date = checkFolder(folder, contents.get(RELEASE_FILE));
        errors.push(...date.problems);

        const notes: Release["notes"] = { new: [], improved: [], fixed: [] };
        for (const file of [...contents.keys()].filter((file) => file !== RELEASE_FILE).sort()) {
            const note = readNote(file, contents.get(file) ?? "");
            if (Array.isArray(note)) {
                errors.push(...note.map((problem) => `${folder}/${file}: ${problem}`));
            } else {
                notes[note.kind].push(note);
            }
        }
        if (date.valid) releases.push({ version: folder, date: date.date, notes });
    }

    return { releases, errors };
}

/** The file of a released version folder naming its version and Release date */
const RELEASE_FILE = "release.yaml";

/** The fields of a `release.yaml` */
const RELEASE_FIELDS = ["version", "date"];

/** The fields of a Release note fragment */
const NOTE_FIELDS = ["kind", "de", "en"];

/** A released version, `major.minor.patch` */
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** What {@link checkFolder} finds out about a folder */
type ReleaseFolder = {
    /** Whether the folder's notes belong to a Release that can be shown */
    valid: boolean;
    /** The Release date, `null` for the pending notes */
    date: string | null;
    /** What is wrong with the folder */
    problems: Array<string>;
};

/**
 * Checks a folder's name and its `release.yaml`.
 *
 * @param folder the folder's name
 * @param text its `release.yaml`, if it has one
 *
 * @returns the Release date and the problems found
 */
function checkFolder(folder: string, text: string | undefined): ReleaseFolder {
    if (folder === UNRELEASED) {
        const problems = text === undefined ? [] : [`${folder}/${RELEASE_FILE}: pending notes have no ${RELEASE_FILE}`];
        return { valid: true, date: null, problems };
    }
    if (!VERSION_PATTERN.test(folder)) {
        return {
            valid: false,
            date: null,
            problems: [`${folder}: is neither ${UNRELEASED} nor a major.minor.patch version`],
        };
    }
    if (text === undefined) return { valid: false, date: null, problems: [`${folder}: ${RELEASE_FILE} is missing`] };

    const fields = readMapping(text, RELEASE_FIELDS);
    if (typeof fields === "string")
        return { valid: false, date: null, problems: [`${folder}/${RELEASE_FILE}: ${fields}`] };
    const problems: Array<string> = [];
    if (fields.version !== folder) problems.push(`version is not ${folder}`);
    const date = fields.date;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push("date is not a YYYY-MM-DD date");
    problems.push(...unknownFields(fields, RELEASE_FIELDS));
    return {
        valid: problems.length === 0,
        date: typeof date === "string" ? date : null,
        problems: problems.map((problem) => `${folder}/${RELEASE_FILE}: ${problem}`),
    };
}

/**
 * Names the fields of a mapping that do not belong in it
 *
 * @param fields the mapping read from a file
 * @param known the fields the file may hold
 *
 * @returns one problem per unknown field
 */
function unknownFields(fields: Record<string, unknown>, known: Array<string>): Array<string> {
    return Object.keys(fields)
        .filter((field) => !known.includes(field))
        .map((field) => `unknown field ${field}`);
}

/**
 * Reads a YAML file that has to be a single mapping.
 *
 * @param text the file's YAML
 * @param fields the fields it should hold, named in the problem
 *
 * @returns the mapping, or what is wrong with the file
 */
function readMapping(text: string, fields: Array<string>): Record<string, unknown> | string {
    let value: unknown;
    try {
        value = parse(text);
    } catch (error) {
        return `is not valid YAML: ${String(error instanceof Error ? error.message : error).split("\n")[0]}`;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `is not a mapping of ${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}`;
    }
    return value as Record<string, unknown>;
}

/**
 * Reads one Release note fragment.
 *
 * @param file the fragment's file name
 * @param text the fragment's YAML
 *
 * @returns the note, or everything wrong with it
 */
function readNote(file: string, text: string): ReleaseNote | Array<string> {
    const fields = readMapping(text, NOTE_FIELDS);
    if (typeof fields === "string") return [fields];
    const { kind, de, en } = fields;
    const problems = unknownFields(fields, NOTE_FIELDS);
    if (!RELEASE_NOTE_KINDS.some((known) => known === kind)) {
        problems.push(`kind ${JSON.stringify(kind)} is none of ${RELEASE_NOTE_KINDS.join(", ")}`);
    }
    for (const [language, value] of [
        ["de", de],
        ["en", en],
    ]) {
        if (typeof value !== "string" || value.trim() === "") problems.push(`${language} is missing or empty`);
    }
    if (problems.length > 0) return problems;
    return { file, kind: kind as ReleaseNoteKind, de: (de as string).trim(), en: (en as string).trim() };
}

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
