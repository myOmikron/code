import { ArrowPathRoundedSquareIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import type { CardOverlayPosition, CardOverlaySlot } from "src/components/card-overlay-action";
import { CardOverlayAction } from "src/components/card-overlay-action";

/**
 * The properties for {@link CardFlipButton}
 */
export type CardFlipButtonProps = {
    /** Whether the back is the side currently shown */
    flipped: boolean;
    /** Turns the card over */
    onFlip: () => void;
    /** Which corner of the artwork it is pinned to, none by default */
    position?: CardOverlayPosition;
    /** Which mark down that corner it is, the outermost by default */
    slot?: CardOverlaySlot;
    /** Anything else the caller needs on it */
    className?: string;
    /** Whether the button lies over artwork and needs stronger separation */
    overlay?: boolean;
};

/**
 * Turns a two-faced card over.
 *
 * Only drawn where there is a second photograph to show, which makes the chip
 * the mark that tells a transform card from an ordinary one while flipping
 * through a page of them.
 *
 * The chip itself is {@link CardOverlayAction}, the one look every action laid
 * on artwork wears; what this adds is the icon, the wording, and the accent
 * fill that says the back is the side on show.
 *
 * @returns the button
 */
export function CardFlipButton({ flipped, onFlip, position, slot, className, overlay = true }: CardFlipButtonProps) {
    const [tg] = useTranslation();

    return (
        <CardOverlayAction
            icon={ArrowPathRoundedSquareIcon}
            label={tg("button.flip-card")}
            active={flipped}
            onClick={onFlip}
            flat={!overlay}
            position={position}
            slot={slot}
            className={className}
        />
    );
}
