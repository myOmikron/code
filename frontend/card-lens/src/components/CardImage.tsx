import type { CardRecord } from "../types";

/** A card's Scryfall thumbnail. */
export function CardImage({ card, className = "" }: { card: CardRecord; className?: string }) {
  return <img className={`card-image ${className}`} src={card.imageUrl} alt={`${card.name}, ${card.setName}`} loading="lazy" />;
}
