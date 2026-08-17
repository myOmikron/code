import { Api } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { CollectionResponse, DeckResponse } from "src/api/generated";
import type { ShareTarget } from "src/components/share-dialog";

/**
 * What the share dialog needs to hand out a collection
 *
 * @param collection the collection to share
 *
 * @returns the target
 */
export function collectionShareTarget(collection: CollectionResponse): ShareTarget {
    return {
        kind: "collections",
        shareToken: collection.share_token ?? null,
        isPublic: collection.visibility === Visibility.Public,
        // The visibility endpoint mints the token without answering with it, so
        // the collection is read back to learn it.
        enable: async () => {
            await Api.collections.setVisibility(collection.uuid, Visibility.Unlisted);
            const updated = await Api.collections.get(collection.uuid);
            return updated.share_token ?? null;
        },
        rotate: async () => (await Api.collections.rotateShareToken(collection.uuid)).share_token,
        revoke: async () => {
            await Api.collections.setVisibility(collection.uuid, Visibility.Private);
        },
    };
}

/**
 * What the share dialog needs to hand out a deck, see {@link collectionShareTarget}
 *
 * @param deck the deck to share
 *
 * @returns the target
 */
export function deckShareTarget(deck: DeckResponse): ShareTarget {
    return {
        kind: "decks",
        shareToken: deck.share_token ?? null,
        isPublic: deck.visibility === Visibility.Public,
        enable: async () => {
            await Api.decks.setVisibility(deck.uuid, Visibility.Unlisted);
            const updated = await Api.decks.get(deck.uuid);
            return updated.share_token ?? null;
        },
        rotate: async () => (await Api.decks.rotateShareToken(deck.uuid)).share_token,
        revoke: async () => {
            await Api.decks.setVisibility(deck.uuid, Visibility.Private);
        },
    };
}
