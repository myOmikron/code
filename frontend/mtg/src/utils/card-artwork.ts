/**
 * Which of a card's two sides is being looked at.
 *
 * Only a card that was photographed twice has a back: a transform card, a modal
 * double-faced card, a battle. A split card or an adventure reads as two cards
 * but is printed on one side, and the catalog leaves its back empty.
 */

/** The scans the catalog holds for a card, in the shape every listing sends them */
export type ScannedCard = {
    /** The front for a list row */
    image_small?: string | null;
    /** The front for a closer look */
    image_normal?: string | null;
    /** The back for a list row */
    image_back_small?: string | null;
    /** The back for a closer look */
    image_back_normal?: string | null;
};

/** One side of a card, in the two sizes Scryfall photographs it at */
export type CardSideArtwork = {
    /** The larger scan, `null` when there is none */
    image: string | null;
    /** The smaller scan, for a `srcSet` beside the larger one */
    thumbnail: string | null;
};

/**
 * Picks one side's artwork out of a listed card
 *
 * @param card the card as a listing sends it, `null` when the catalog has not caught up with it
 * @param side which side is wanted
 *
 * @returns the two scans of that side, `null` where the catalog has neither
 */
export function artworkOf(card: ScannedCard | null | undefined, side: "front" | "back"): CardSideArtwork {
    const thumbnail = (side === "front" ? card?.image_small : card?.image_back_small) ?? null;
    const image = (side === "front" ? card?.image_normal : card?.image_back_normal) ?? thumbnail;
    return { image, thumbnail };
}

/**
 * Whether a card has a second side to turn to
 *
 * @param card the card as a listing sends it
 *
 * @returns whether there is a back
 */
export function hasBack(card: ScannedCard | null | undefined): boolean {
    return artworkOf(card, "back").image !== null;
}

/**
 * The same scan one size up, for a closer look.
 *
 * A card record only carries Scryfall's `normal` scan, 488 pixels across, which is right for a
 * list row and soft on a phone held at arm's length. The sizes are one path segment of the same
 * url, so the bigger file follows from the smaller one without a second lookup, and anything that
 * is not a Scryfall url is handed back untouched.
 *
 * @param url the scan a listing sent
 *
 * @returns the larger scan of the same side of the same card
 */
export function largerScan(url: string): string {
    return url.replace("https://cards.scryfall.io/normal/", "https://cards.scryfall.io/large/");
}
