/**
 * Which art an MPCFill order takes for each card face.
 *
 * Each deck picks its own art, unless a pick was taken for every deck holding
 * the card. Whether to ask about that is remembered on the device.
 */

import type { MpcFillImageResponse } from "src/api/generated";
import { mpcFaces } from "src/utils/mpcfill";
import { groupKey } from "src/utils/proxy-list";
import type { ProxyGroup } from "src/utils/proxy-list";
import { loadChoice, saveChoice } from "src/utils/stored-choice";

/** The picks for one card face */
export type MpcFacePicks = {
    /** The image taken for every deck, `null` while there is none */
    everyDeck: string | null;
    /** The image each group took for itself, by {@link groupKey} */
    groups: Record<string, string>;
};

/** The art picks of an order, by card face */
export type MpcPicks = Record<string, MpcFacePicks>;

/** Whether a new art pick is taken for every deck holding the card */
export const MPC_ART_SCOPES = ["ask", "all", "deck"] as const;

/** One answer to that */
export type MpcArtScope = (typeof MPC_ART_SCOPES)[number];

/** Where the answer is remembered on this device */
const ART_SCOPE_KEY = "cardlens.mpcfill-art-scope.v1";

/**
 * The art taken for one face in one group
 *
 * The group's own pick comes first, then one taken for every deck, then the
 * favorite, then the top hit.
 *
 * @param picks the order's picks
 * @param images what was found for the face
 * @param group the group the card is in
 * @param face the name MPCFill is asked for
 * @param favorite the account's favorite for the face, if it was found
 *
 * @returns the image, `null` while there is none
 */
export function mpcPick(
    picks: MpcPicks,
    images: Array<MpcFillImageResponse>,
    group: ProxyGroup,
    face: string,
    favorite: MpcFillImageResponse | null = null,
): MpcFillImageResponse | null {
    const chosen = picks[face]?.groups[groupKey(group)] ?? picks[face]?.everyDeck;
    return images.find((image) => image.id === chosen) ?? favorite ?? images[0] ?? null;
}

/**
 * Takes an image for one face
 *
 * @param picks the order's picks
 * @param group the group the card was picked in
 * @param face the name MPCFill is asked for
 * @param id the image
 * @param everywhere whether every deck takes it, decks picked apart before included
 *
 * @returns the new picks
 */
export function mpcChoose(picks: MpcPicks, group: ProxyGroup, face: string, id: string, everywhere: boolean): MpcPicks {
    if (everywhere) return { ...picks, [face]: { everyDeck: id, groups: {} } };

    const known = picks[face] ?? { everyDeck: null, groups: {} };
    return { ...picks, [face]: { ...known, groups: { ...known.groups, [groupKey(group)]: id } } };
}

/**
 * How many groups of the order hold a face
 *
 * @param groups the order
 * @param face the name MPCFill is asked for
 *
 * @returns the groups
 */
export function mpcGroupsWith(groups: Array<ProxyGroup>, face: string): number {
    return groups.filter((group) =>
        group.cards.some((card) => {
            const { front, back } = mpcFaces(card);
            return front === face || back === face;
        }),
    ).length;
}

/**
 * Whether this device takes a new art pick for every deck
 *
 * @returns the answer, asking each time when there is none
 */
export function loadMpcArtScope(): MpcArtScope {
    return loadChoice(ART_SCOPE_KEY, MPC_ART_SCOPES, "ask");
}

/**
 * Remembers that on this device
 *
 * @param scope the answer
 */
export function saveMpcArtScope(scope: MpcArtScope) {
    saveChoice(ART_SCOPE_KEY, scope);
}
