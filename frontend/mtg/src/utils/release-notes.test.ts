import { describe, expect, it } from "vitest";
import {
    UNRELEASED,
    displayedReleases,
    parseReleaseNotes,
    seenReleaseNotes,
    unreadReleaseNotes,
} from "src/utils/release-notes";

/**
 * A released version folder holding one note
 *
 * @param version the folder's version
 * @param kind the note's kind, or nothing for a Release without notes
 *
 * @returns the files of that folder
 */
function released(version: string, kind: string | null = "new"): Record<string, string> {
    const files = { [`release-notes/${version}/release.yaml`]: `version: ${version}\ndate: 2026-10-01\n` };
    if (kind === null) return files;
    return {
        ...files,
        [`release-notes/${version}/note.yaml`]: `kind: ${kind}\nde: Neu in ${version}.\nen: New in ${version}.\n`,
    };
}

/**
 * The versions shown, in their order
 *
 * @param files the release-notes directory
 * @param dev whether it is a dev build
 *
 * @returns the displayed versions
 */
function shown(files: Record<string, string>, dev = false): Array<string> {
    return displayedReleases(parseReleaseNotes(files).releases, dev).map((release) => release.version);
}

describe("parseReleaseNotes", () => {
    it("groups a Release's notes by kind, ordered by file name", () => {
        const { releases, errors } = parseReleaseNotes({
            "release-notes/0.57.0/release.yaml": "version: 0.57.0\ndate: 2026-10-20\n",
            "release-notes/0.57.0/undo.yaml": "kind: new\nde: Rückgängig machen.\nen: Undo.\n",
            "release-notes/0.57.0/b-scanner.yaml": "kind: fixed\nde: Scanner repariert.\nen: Scanner fixed.\n",
            "release-notes/0.57.0/a-prices.yaml": "kind: fixed\nde: Preise repariert.\nen: Prices fixed.\n",
        });

        expect(errors).toStrictEqual([]);
        expect(releases).toStrictEqual([
            {
                version: "0.57.0",
                date: "2026-10-20",
                notes: {
                    new: [{ file: "undo.yaml", kind: "new", de: "Rückgängig machen.", en: "Undo." }],
                    improved: [],
                    fixed: [
                        { file: "a-prices.yaml", kind: "fixed", de: "Preise repariert.", en: "Prices fixed." },
                        { file: "b-scanner.yaml", kind: "fixed", de: "Scanner repariert.", en: "Scanner fixed." },
                    ],
                },
            },
        ]);
    });
});

describe("parseReleaseNotes validation", () => {
    /**
     * The errors of the pending notes
     *
     * @param fragments the fragment texts by file name
     *
     * @returns the validation errors
     */
    function errorsOf(fragments: Record<string, string>): Array<string> {
        const files = Object.fromEntries(
            Object.entries(fragments).map(([file, text]) => [`release-notes/unreleased/${file}`, text]),
        );
        return parseReleaseNotes(files).errors;
    }

    it("refuses an unknown kind and leaves the note out", () => {
        const { releases, errors } = parseReleaseNotes({
            "release-notes/unreleased/undo.yaml": "kind: feature\nde: Rückgängig.\nen: Undo.\n",
        });
        expect(errors).toStrictEqual(['unreleased/undo.yaml: kind "feature" is none of new, improved, fixed']);
        expect(displayedReleases(releases, true)).toStrictEqual([]);
    });

    it("refuses a missing or empty text, in every file at once", () => {
        expect(
            errorsOf({
                "a.yaml": "kind: new\nen: Undo.\n",
                "b.yaml": "kind: new\nde: '  '\nen: Undo.\n",
                "c.yaml": "kind: new\nde: Rückgängig.\nen:\n",
                "d.yaml": "kind: new\nde: 42\nen: Undo.\n",
            }),
        ).toStrictEqual([
            "unreleased/a.yaml: de is missing or empty",
            "unreleased/b.yaml: de is missing or empty",
            "unreleased/c.yaml: en is missing or empty",
            "unreleased/d.yaml: de is missing or empty",
        ]);
    });

    it("refuses malformed YAML and a fragment that is no mapping", () => {
        expect(
            errorsOf({
                "a.yaml": "kind: new\nde: Rückgängig: mit Strg+Z\nen: Undo.\n",
                "b.yaml": "- kind: new\n",
                "c.yaml": "",
            }),
        ).toStrictEqual([
            expect.stringMatching(/^unreleased\/a\.yaml: is not valid YAML: .*line 2, column 5/),
            "unreleased/b.yaml: is not a mapping of kind, de and en",
            "unreleased/c.yaml: is not a mapping of kind, de and en",
        ]);
    });

    it("refuses a field it does not know", () => {
        expect(errorsOf({ "a.yaml": "kind: new\nde: Rückgängig.\nen: Undo.\nfr: Annuler.\n" })).toStrictEqual([
            "unreleased/a.yaml: unknown field fr",
        ]);
    });

    it("refuses a release folder without release.yaml and leaves it out", () => {
        const { releases, errors } = parseReleaseNotes({
            ...released("0.56.0"),
            "release-notes/0.57.0/undo.yaml": "kind: new\nde: Rückgängig.\nen: Undo.\n",
        });
        expect(errors).toStrictEqual(["0.57.0: release.yaml is missing"]);
        expect(releases.map((release) => release.version)).toStrictEqual(["0.56.0"]);
    });

    it("refuses a release.yaml that does not name its folder's version and a date", () => {
        expect(
            parseReleaseNotes({
                "release-notes/0.57.0/release.yaml": "version: 0.58.0\ndate: 20.10.2026\n",
                "release-notes/0.58.0/release.yaml": "date: 2026-10-21\nnotes: none\n",
            }).errors,
        ).toStrictEqual([
            "0.57.0/release.yaml: version is not 0.57.0",
            "0.57.0/release.yaml: date is not a YYYY-MM-DD date",
            "0.58.0/release.yaml: version is not 0.58.0",
            "0.58.0/release.yaml: unknown field notes",
        ]);
    });

    it("refuses a folder that is neither a version nor unreleased", () => {
        expect(
            parseReleaseNotes({ "release-notes/v0.57/undo.yaml": "kind: new\nde: R.\nen: U.\n" }).errors,
        ).toStrictEqual(["v0.57: is neither unreleased nor a major.minor.patch version"]);
    });

    it("refuses a release.yaml among the pending notes", () => {
        expect(errorsOf({ "release.yaml": "version: 0.57.0\ndate: 2026-10-21\n" })).toStrictEqual([
            "unreleased/release.yaml: pending notes have no release.yaml",
        ]);
    });
});

describe("displayedReleases", () => {
    it("lists Releases newest first by version, not by text", () => {
        expect(
            shown({ ...released("0.9.0"), ...released("0.10.0"), ...released("0.9.1"), ...released("1.0.0") }),
        ).toStrictEqual(["1.0.0", "0.10.0", "0.9.1", "0.9.0"]);
    });

    it("leaves out Releases without notes", () => {
        expect(shown({ ...released("0.56.0"), ...released("0.57.0", null) })).toStrictEqual(["0.56.0"]);
    });

    const pending = {
        ...released("0.56.0"),
        "release-notes/unreleased/undo.yaml": "kind: new\nde: Rückgängig.\nen: Undo.\n",
    };

    it("shows the pending notes on top in a dev build", () => {
        expect(shown(pending, true)).toStrictEqual([UNRELEASED, "0.56.0"]);
        expect(displayedReleases(parseReleaseNotes(pending).releases, true)[0].date).toBeNull();
    });

    it("never shows the pending notes in a release build", () => {
        expect(shown(pending, false)).toStrictEqual(["0.56.0"]);
    });
});

describe("unreadReleaseNotes", () => {
    const releases = displayedReleases(
        parseReleaseNotes({ ...released("0.55.0"), ...released("0.56.0", null), ...released("0.57.0") }).releases,
        false,
    );

    it("shows no dot on a first visit and quietly remembers the running Release", () => {
        expect(unreadReleaseNotes(null, releases, "0.58.0")).toStrictEqual({ dot: false, store: "0.58.0" });
    });

    it("shows the dot when a Release after the last seen one brought notes", () => {
        expect(unreadReleaseNotes("0.56.0", releases, "0.58.0")).toStrictEqual({ dot: true, store: null });
        expect(unreadReleaseNotes("0.10.0", releases, "0.58.0")).toStrictEqual({ dot: true, store: null });
    });

    it("shows no dot when the Releases since the last seen one brought no notes", () => {
        expect(unreadReleaseNotes("0.57.0", releases, "0.58.0")).toStrictEqual({ dot: false, store: null });
        expect(unreadReleaseNotes("0.58.0", releases, "0.58.0")).toStrictEqual({ dot: false, store: null });
    });

    it("takes a stored value that is no version for a first visit", () => {
        expect(unreadReleaseNotes("yesterday", releases, "0.58.0")).toStrictEqual({ dot: false, store: "0.58.0" });
    });
});

describe("seenReleaseNotes", () => {
    it("remembers the running Release once its notes are seen", () => {
        const releases = displayedReleases(parseReleaseNotes(released("0.57.0")).releases, false);
        expect(seenReleaseNotes(releases, "0.57.0")).toBe("0.57.0");
        expect(seenReleaseNotes(releases, "0.58.0")).toBe("0.58.0");
        expect(seenReleaseNotes([], "0.58.0")).toBe("0.58.0");
    });

    it("remembers the pending notes in a dev build, whose version is older than every Release", () => {
        const releases = displayedReleases(
            parseReleaseNotes({
                ...released("0.57.0"),
                "release-notes/unreleased/undo.yaml": "kind: new\nde: Rückgängig.\nen: Undo.\n",
            }).releases,
            true,
        );
        const seen = seenReleaseNotes(releases, "0.1.0");
        expect(seen).toBe(UNRELEASED);
        expect(unreadReleaseNotes(seen, releases, "0.1.0")).toStrictEqual({ dot: false, store: null });
        expect(unreadReleaseNotes("0.57.0", releases, "0.1.0").dot).toBe(true);
    });
});
