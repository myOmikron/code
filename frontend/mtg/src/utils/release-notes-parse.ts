/**
 * Reads and validates the Release note fragments and `release.yaml` files.
 *
 * Runs at build time only, in the vite plugin and the check script (see
 * `scripts/release-notes.ts`), so the YAML parser never reaches the browser.
 */

import { parse } from "yaml";
import { RELEASE_NOTE_KINDS, UNRELEASED, VERSION_PATTERN } from "./release-notes";
import type { Release, ReleaseNote, ReleaseNoteKind } from "./release-notes";

/** The Releases read from the fragments, and everything wrong with them */
export type ParsedReleaseNotes = {
    /** Every Release with its valid notes */
    releases: Array<Release>;
    /** One message per problem, naming the file */
    errors: Array<string>;
};

/** The file of a released version folder naming its version and Release date */
const RELEASE_FILE = "release.yaml";

/** The fields of a `release.yaml` */
const RELEASE_FIELDS = ["version", "date"];

/** The fields of a Release note fragment */
const NOTE_FIELDS = ["kind", "de", "en"];

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
