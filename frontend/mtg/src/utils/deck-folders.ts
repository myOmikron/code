/**
 * The shelves decks are filed on.
 *
 * A deck lies in at most one folder, so the deck list is a set of sections that
 * between them hold every deck exactly once — the ones on no shelf included.
 */

import type { DeckFolderResponse, DeckOverviewResponse } from "src/api/generated";

/**
 * What a folder is called on screen
 *
 * The archive is the one folder the app made rather than the account: it
 * carries the name it was created under, and is shown under the app's own word
 * for it instead, in the language the page is running in.
 *
 * @param folder the folder
 * @param archive the app's word for the archive
 *
 * @returns the name to show
 */
export function folderLabel(folder: DeckFolderResponse, archive: string): string {
    return folder.kind === "Archive" ? archive : folder.name;
}

/** The section key the archive is remembered under */
export const ARCHIVE_SECTION = "archive";

/** The section key the decks on no shelf are remembered under */
export const UNFILED_SECTION = "unfiled";

/** One section of the deck list: a folder and what is filed in it */
export type FolderSection = {
    /**
     * What the section is remembered as, for anything stored per section.
     *
     * A folder the account made is its own id; the archive and the unfiled
     * decks get a fixed word, so a preference about them can be written down
     * before either exists on this device.
     */
    key: string;
    /** The folder, `null` for the decks on no shelf at all */
    folder: DeckFolderResponse | null;
    /** The decks in it */
    decks: Array<DeckOverviewResponse>;
};

/**
 * What a section is remembered as
 *
 * @param folder the folder, `null` for the unfiled decks
 *
 * @returns the key
 */
export function sectionKey(folder: DeckFolderResponse | null): string {
    if (folder === null) return UNFILED_SECTION;
    return folder.kind === "Archive" ? ARCHIVE_SECTION : folder.uuid;
}

/**
 * The decks sorted onto their shelves.
 *
 * The account's own folders come first, in the alphabetical order the service
 * hands them over in, then the decks on no shelf, and the archive closes the
 * list. Unfiled decks are still in play — they are the ones nobody has decided
 * about yet — so they belong above the shelf whose whole point is being out of
 * the way.
 *
 * A folder holding nothing is kept when `keepEmpty` is set, which is what makes
 * a shelf somebody just made visible before the first deck goes onto it; while
 * a search is narrowing the list it would only be noise.
 *
 * @param decks the decks to sort
 * @param folders the account's folders
 * @param keepEmpty whether folders holding nothing stay in the list
 *
 * @returns one section per folder, and one for the unfiled decks
 */
export function byFolder(
    decks: Array<DeckOverviewResponse>,
    folders: Array<DeckFolderResponse>,
    keepEmpty: boolean,
): Array<FolderSection> {
    const filed = folders
        .map((folder) => ({
            key: sectionKey(folder),
            folder,
            decks: decks.filter((overview) => overview.deck.folder === folder.uuid),
        }))
        .filter((section) => section.decks.length > 0 || (keepEmpty && section.folder.kind !== "Archive"));
    const loose = decks.filter((overview) => overview.deck.folder == null);

    const sections: Array<FolderSection> = filed.filter((section) => section.folder.kind !== "Archive");
    if (loose.length > 0) sections.push({ key: UNFILED_SECTION, folder: null, decks: loose });
    sections.push(...filed.filter((section) => section.folder.kind === "Archive"));
    return sections;
}
