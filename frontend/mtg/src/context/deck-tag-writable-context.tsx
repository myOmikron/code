import { createContext, useContext } from "react";
import type { DeckTagResponse } from "src/api/generated";

/** Says whether the reader may put a tag on a card and take it off again */
export type DeckTagWritable = (tag: DeckTagResponse) => boolean;

/**
 * Which tags the tag pickers of a deck page offer to toggle
 *
 * Every tag where nothing says otherwise. An Editor sees the owner's global tags
 * on the cards but may not toggle them, so the deck page narrows it.
 */
export const DeckTagWritableContext = createContext<DeckTagWritable>(() => true);

/**
 * Access the check whether a tag may be toggled
 *
 * @returns the check
 */
export function useDeckTagWritable(): DeckTagWritable {
    return useContext(DeckTagWritableContext);
}
