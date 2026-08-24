import { describe, expect, it } from "vitest";
import type { DeckFolderResponse, DeckOverviewResponse } from "src/api/generated";
import { byFolder, folderLabel } from "src/utils/deck-folders";

/**
 * A folder, with only what the sorting reads
 *
 * @param uuid its id
 * @param name what it is called
 * @param kind whether it is the archive
 *
 * @returns the folder
 */
function folder(uuid: string, name: string, kind: "Custom" | "Archive" = "Custom") {
    return { uuid, name, kind, created_at: "2026-01-01T00:00:00Z" } as unknown as DeckFolderResponse;
}

/**
 * A deck, with only the shelf it stands on
 *
 * @param uuid its id
 * @param inFolder the folder it is filed in, `null` for none
 *
 * @returns the overview
 */
function deck(uuid: string, inFolder: string | null) {
    return { deck: { uuid, folder: inFolder } } as unknown as DeckOverviewResponse;
}

describe("byFolder", () => {
    const planned = folder("planned", "Planned");
    const shared = folder("shared", "Shared by others");
    const archive = folder("archive-id", "Archived", "Archive");

    it("closes the list with the archive, the unfiled decks above it", () => {
        const sections = byFolder(
            [deck("a", "planned"), deck("b", null), deck("c", "archive-id")],
            [planned, shared, archive],
            false,
        );

        expect(sections.map((section) => section.key)).toEqual(["planned", "unfiled", "archive"]);
    });

    it("keeps empty shelves only while nothing is being searched for", () => {
        const decks = [deck("a", "planned")];

        expect(byFolder(decks, [planned, shared, archive], true).map((section) => section.key)).toEqual([
            "planned",
            "shared",
        ]);
        expect(byFolder(decks, [planned, shared, archive], false).map((section) => section.key)).toEqual(["planned"]);
    });

    it("files every deck exactly once", () => {
        const decks = [deck("a", "planned"), deck("b", null), deck("c", "archive-id"), deck("d", "planned")];
        const sections = byFolder(decks, [planned, shared, archive], true);

        expect(sections.flatMap((section) => section.decks.map((overview) => overview.deck.uuid)).sort()).toEqual([
            "a",
            "b",
            "c",
            "d",
        ]);
    });
});

describe("folderLabel", () => {
    it("calls the archive what the app calls it", () => {
        expect(folderLabel(folder("archive-id", "Archived", "Archive"), "Archiv")).toBe("Archiv");
        expect(folderLabel(folder("planned", "Planned"), "Archiv")).toBe("Planned");
    });
});
