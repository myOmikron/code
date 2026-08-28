/**
 * The shapes a watch list can be looked at in.
 *
 * A want list is read for two different errands and they want different things
 * from the width. Standing in a shop it is one card at a time, with everything
 * about it in reach; sitting down to plan a purchase it is all of them at once,
 * to compare. The views differ in what they spend the room on, never in what
 * can be done from them.
 */

import type { WatchListEntryResponse, WatchedCopyResponse } from "src/api/generated";
import type { WatchMatchPatch } from "src/utils/watch-list";

/** How the watched cards are laid out */
export type WatchView = "cards" | "grid" | "table";

/** The views on offer, in the order they are listed */
export const WATCH_VIEWS: Array<WatchView> = ["cards", "grid", "table"];

/**
 * What every view is handed.
 *
 * The same set for all three, so switching between them changes the layout and
 * nothing about what can be done from it.
 */
export type WatchViewProps = {
    /** The rows to draw, already filtered and ordered */
    entries: Array<WatchListEntryResponse>;
    /** Opens a row for editing */
    onEdit: (entry: WatchListEntryResponse) => void;
    /** Marks a standing alarm as read */
    onAcknowledge: (entry: WatchListEntryResponse) => void;
    /** Changes what a row counts */
    onMatch: (entry: WatchListEntryResponse, patch: WatchMatchPatch) => void;
    /** Opens the language picker for a row */
    onLanguages: (entry: WatchListEntryResponse) => void;
    /**
     * Records pointer or focus arriving on a row
     *
     * What the keys act on. `pointerCard` alone does not establish it — that
     * only re-derives which row is under the pointer after a render, which is
     * a correction, not a first answer.
     */
    onActivate: (entry: WatchListEntryResponse) => void;
    /** Opens or closes the stacks under a row */
    onToggleCopies: (entry: WatchListEntryResponse) => void;
    /** Which row has its stacks unfolded */
    unfolded: string | null;
    /** The stacks held per row, absent for one that has not been opened */
    copies: Record<string, Array<WatchedCopyResponse>>;
    /** The row currently being written */
    busy: string | null;
};
