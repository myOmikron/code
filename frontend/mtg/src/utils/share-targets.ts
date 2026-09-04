import { Api, handleError } from "src/api/api";
import { Visibility } from "src/api/generated";
import type { CollectionResponse, DeckResponse, TournamentResponse } from "src/api/generated";
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
        id: collection.uuid,
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
        id: deck.uuid,
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

/**
 * Mints a tournament a fresh share token by putting it into `Unlisted`, then reads the token back
 *
 * Unlike decks and collections, tournaments have no dedicated rotate-token endpoint —
 * `setVisibility(Unlisted)` already mints a fresh token on every call it is given, whether the
 * tournament was already `Unlisted` or not, so a second endpoint would do nothing this one does
 * not: enabling and rotating are the same request. Neither answers with the token itself, so both
 * re-read the tournament afterwards to learn it, exactly like `deckShareTarget.enable` above.
 *
 * `Api.tournaments.get` bypasses `handleError` itself (see its comment in `api.tsx`) because its
 * other caller, the tournament layout's loader, is guest-reachable and a 401 there must not bounce
 * a guest into a login redirect they cannot complete. This call site has no such reader: only an
 * organizer who is already looking at the settings page of a tournament they manage reaches it, so
 * a failure here is wrapped in `handleError` directly — the same call `clone-deck-dialog.tsx`
 * makes on an otherwise guest-safe read, for the same reason.
 *
 * @param uuid the tournament to (re)share
 *
 * @returns the fresh token
 */
async function mintTournamentShareToken(uuid: string): Promise<string | null> {
    await Api.tournaments.setVisibility(uuid, Visibility.Unlisted);
    const updated = await handleError(Api.tournaments.get(uuid));
    return updated.tournament.share_token ?? null;
}

/**
 * What the share dialog needs to hand out a tournament, see {@link collectionShareTarget}
 *
 * @param tournament the tournament to share
 *
 * @returns the target
 */
export function tournamentShareTarget(tournament: TournamentResponse): ShareTarget {
    return {
        kind: "tournaments",
        id: tournament.uuid,
        shareToken: tournament.share_token ?? null,
        isPublic: tournament.visibility === Visibility.Public,
        enable: () => mintTournamentShareToken(tournament.uuid),
        // Same request as `enable` — see `mintTournamentShareToken`. `Unlisted` always carries a
        // token, so a `null` here would mean that invariant broke, not something to paper over
        // with a placeholder string.
        rotate: async () => {
            const token = await mintTournamentShareToken(tournament.uuid);
            if (token == null) throw new Error("Tournament set to Unlisted but carries no share token");
            return token;
        },
        revoke: async () => {
            await Api.tournaments.setVisibility(tournament.uuid, Visibility.Private);
        },
    };
}
