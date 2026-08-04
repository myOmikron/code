import type { CardRecord } from "../types";

/** A card's Scryfall thumbnail. Callers set the size; the placeholder colour keeps the layout
 *  from flashing white while the image loads. */
export function CardImage({ card, className = "" }: { card: CardRecord; className?: string }) {
  return (
    <img
      className={`bg-[#272922] object-cover ${className}`}
      src={card.imageUrl}
      alt={`${card.name}, ${card.setName}`}
      loading="lazy"
    />
  );
}
