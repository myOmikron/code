import { Api } from "src/api/api";
import type { CollectionOverviewResponse } from "src/api/generated";

/**
 * Reads the collections cards can be sorted back into: every one of the account's
 * collections except the Physical decks
 *
 * @returns the collections on the shelf
 */
export async function readShelfCollections(): Promise<Array<CollectionOverviewResponse>> {
    const collections = await Api.collections.list();
    return collections.filter((entry) => entry.collection.deck == null);
}
