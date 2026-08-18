import clsx from "clsx";
import type { CardFinish } from "src/api/generated";
import { FoilFrame } from "src/components/foil-frame";

/**
 * The properties for {@link CardThumbnail}
 */
export type CardThumbnailProps = {
    /** The card's name, which is also the image's alternative text */
    name: string;
    /** The artwork, `null` when the catalog has none */
    image: string | null;
    /** The smaller scan of the same card, for where the artwork is drawn tiny */
    thumbnail?: string | null;
    /** How wide the artwork ends up, so the browser can pick between the two scans */
    sizes?: string;
    /** The finish, so the sheen matches the cards in hand */
    finish: CardFinish;
    /** Classes for the frame — this is where a view sets the size */
    className?: string;
    /** Whether the artwork is small enough to need the compact sheen */
    compact?: boolean;
};

/**
 * A card's artwork at whatever size the view around it wants.
 *
 * The size lives entirely in `className`, so the four views can show the same
 * card as a stamp or as a portrait without any of them knowing how the sheen
 * works.
 *
 * @returns the artwork
 */
export function CardThumbnail({
    name,
    image,
    thumbnail,
    sizes,
    finish,
    className,
    compact = false,
}: CardThumbnailProps) {
    // Scryfall's small scan is 146 pixels wide and its normal one 488. Squeezing
    // the big one into a tile a third of its width is what makes the card text
    // shimmer, so both are offered and the browser takes the one that fits the
    // box and the screen it is drawing on.
    const scans =
        image !== null && thumbnail != null && thumbnail !== image ? `${thumbnail} 146w, ${image} 488w` : undefined;
    return (
        // The ratio belongs to the frame, not to the image. On the image it only
        // takes effect once the file has arrived, so the box was flat until then
        // and everything below it jumped down the moment it loaded — worst in a
        // dialog on a slow phone, where the picture appears above what is being
        // read and takes the scroll position with it.
        <FoilFrame
            finish={finish}
            compact={compact}
            className={clsx(className, "aspect-5/7 bg-zinc-200 dark:bg-zinc-700")}
        >
            {image !== null && (
                <img
                    src={image}
                    srcSet={scans}
                    sizes={scans === undefined ? undefined : sizes}
                    crossOrigin={"anonymous"}
                    alt={name}
                    loading={"lazy"}
                    className={"block size-full object-cover"}
                />
            )}
        </FoilFrame>
    );
}
