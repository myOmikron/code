/**
 * One printing of a card, as the scanner reports it
 */
export type CardRecord = {
    id: string;
    name: string;
    setName: string;
    setCode: string;
    collectorNumber: string;
    manaCost: string;
    typeLine: string;
    colors: string[];
    imageUrl: string;
    priceEur: number | null;
    /**
     * Which language this copy is printed in, where the source knows.
     *
     * Optional because most of the app's card records come from places that only ever dealt in
     * English. It is its own axis and not part of the printing: 57262 of the catalogue's 109108
     * printings exist in more than one language under the very same set and collector number.
     */
    lang?: string;
};

/**
 * The perceptual fingerprint of a card image, in the flavours the matcher ranks by
 */
export type ImageSignature = {
    differenceHash: string;
    averageHash: string;
    artworkHash: string;
    detailVector: number[];
    artworkVector: number[];
    artworkEdgeVector: number[];
    spatialColorVector: number[];
    titleVector: number[];
    setSymbolVector: number[];
    footerVector: number[];
    stampVector: number[];
    chromaVector: number[];
    edgeVector: number[];
    colorVector: number[];
    dominantColor: number;
};

/**
 * A card record plus the signature it is matched against
 */
export type IndexedCard = CardRecord & {
    signature: ImageSignature;
};

/**
 * A card the matcher considers, with the score it earned
 */
export type MatchCandidate = {
    card: IndexedCard;
    similarity: number;
};
