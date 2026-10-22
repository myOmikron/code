import type { DeckRole, DeckTagResponse } from "src/api/generated";

/** What the reader may do on a deck page, beyond looking at the deck */
export type DeckRights = {
    /** Changes the deck as a decklist: cards, zones, settings, advisor, and the tags local to it */
    edit: boolean;
    /** Acts on the owner's shelf: collection, sourcing, proxies, Deck history, sharing, Collaborators, folder, deletion */
    owner: boolean;
    /** Also creates, changes and assigns the owner's global tags, which reach every deck of theirs */
    globalTags: boolean;
};

/**
 * What a role on a deck lets its reader do there
 *
 * @param role the reader's role on the deck, `null` or absent for none
 *
 * @returns what the page offers the reader
 */
export function deckRights(role: DeckRole | null | undefined): DeckRights {
    const owner = role === "Owner";
    const edit = owner || role === "Editor";
    return { edit, owner, globalTags: owner };
}

/**
 * Whether the reader may change a tag of the deck or put it on and take it off a card
 *
 * @param rights what the reader may do on the deck
 * @param tag the tag, local to the deck or global
 *
 * @returns whether the tag is the reader's to change
 */
export function tagWritable(rights: DeckRights, tag: Pick<DeckTagResponse, "deck">): boolean {
    return tag.deck != null ? rights.edit : rights.globalTags;
}

/**
 * Where a deck's cards open for a reader with this role
 *
 * @param role the reader's role on the deck, `null` or absent for none
 *
 * @returns the deck builder for whoever may edit the deck, the read-only Collaborator page otherwise
 */
export function deckCardsRoute(
    role: DeckRole | null | undefined,
): "/decks/$deckUuid/cards" | "/collaborating/$deckUuid/cards" {
    return deckRights(role).edit ? "/decks/$deckUuid/cards" : "/collaborating/$deckUuid/cards";
}
