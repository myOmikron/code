/**
 * One printing of a card, as the scanner reports it
 */
export type CardRecord = {
    id: string;
    name: string;
    setName: string;
    setCode: string;
    collectorNumber: string;
    /** Scryfall language code of the printing; records from older indexes lack it. */
    lang?: string;
    manaCost: string;
    typeLine: string;
    colors: string[];
    imageUrl: string;
    priceEur: number | null;
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
