import { useTranslation } from "react-i18next";
import type { CardRecord } from "src/types";

/**
 * The properties for {@link CardImage}
 */
export type CardImageProps = {
    card: CardRecord;
    className?: string;
};

/**
 * A card's Scryfall thumbnail.
 *
 * Callers set the size; the placeholder colour keeps the layout from flashing white while the
 * image loads.
 *
 * @returns the thumbnail
 */
export function CardImage({ card, className = "" }: CardImageProps) {
    const [tg] = useTranslation();

    return (
        <img
            className={`bg-[#272922] object-cover ${className}`}
            src={card.imageUrl}
            alt={tg("accessibility.card-image", { name: card.name, setName: card.setName })}
            loading="lazy"
        />
    );
}
