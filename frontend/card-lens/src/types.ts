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
};

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

export type IndexedCard = CardRecord & {
  signature: ImageSignature;
};

export type MatchCandidate = {
  card: IndexedCard;
  similarity: number;
};

export type CollectionEntry = {
  card: CardRecord;
  quantity: number;
  foilQuantity: number;
  addedAt: string;
};
