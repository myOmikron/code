import { ArrowPathRoundedSquareIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link CardFlipButton}
 */
export type CardFlipButtonProps = {
    /** Whether the back is the side currently shown */
    flipped: boolean;
    /** Turns the card over */
    onFlip: () => void;
    /** Where the chip sits, which is the caller's business */
    className?: string;
};

/**
 * Turns a two-faced card over.
 *
 * Only drawn where there is a second photograph to show, which makes the chip
 * the mark that tells a transform card from an ordinary one while flipping
 * through a page of them.
 *
 * It lays over the artwork but is not part of it: every view makes its artwork
 * a button that opens the card, and a button inside a button is not markup a
 * browser agrees on. The caller therefore places this as a sibling, the way it
 * places the Cardmarket link.
 *
 * @returns the button
 */
export function CardFlipButton({ flipped, onFlip, className }: CardFlipButtonProps) {
    const [tg] = useTranslation();
    const label = tg("button.flip-card");

    return (
        <button
            type={"button"}
            title={label}
            aria-label={label}
            aria-pressed={flipped}
            onClick={(event) => {
                // The artwork behind it opens the card; turning it over must not
                // do both.
                event.stopPropagation();
                onFlip();
            }}
            className={clsx(
                "inline-flex items-center justify-center rounded-full p-1.5 text-white transition",
                flipped ? "bg-(--color-brand-600) hover:bg-(--color-brand-500)" : "bg-zinc-950/75 hover:bg-zinc-950",
                className,
            )}
        >
            <ArrowPathRoundedSquareIcon className={"size-4.5"} aria-hidden={true} />
        </button>
    );
}
