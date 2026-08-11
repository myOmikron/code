import clsx from "clsx";
import type { ReactNode } from "react";
import type { CardFinish } from "src/api/generated";

/**
 * The properties for {@link FoilFrame}
 */
export type FoilFrameProps = {
    /** The finish the cards in this stack have */
    finish: CardFinish;
    /** Classes for the frame, which is where the rounding belongs */
    className?: string;
    /**
     * Whether the artwork is shown at thumbnail size.
     *
     * A sheen tuned for a card held in the hand disappears at sixty-four
     * pixels: the gradient has fewer pixels to work with, and the eye is
     * looking at a stamp rather than at a card. The small variant is therefore
     * not the same effect turned down but the same effect turned *up*, with
     * fewer, harder bands.
     */
    compact?: boolean;
    /** The artwork to lay the sheen over */
    children: ReactNode;
};

/**
 * Puts a foil sheen over a card's artwork.
 *
 * Scryfall photographs every card flat, so a foil and its ordinary printing
 * arrive as the same picture. The badge next to a row already says which one it
 * is, but a badge is something to read — the point of this is that a binder
 * page full of cards shows its foils at a glance, the way it does in a hand.
 *
 * Built from gradients rather than an overlay image: it costs no request, scales
 * to any size, and the two finishes differ by a few colour stops instead of by
 * two files.
 *
 * The frame wraps even a plain card, so that turning a stack foil in the edit
 * dialog changes the picture and not the layout around it.
 *
 * @returns the framed artwork
 */
export function FoilFrame({ finish, className, compact = false, children }: FoilFrameProps) {
    return (
        <span className={clsx(className, "group/foil relative isolate block overflow-hidden")}>
            {children}

            {finish === "Foil" && (
                <>
                    {/* The rainbow, swept as a cone so the hues turn around the
                        card rather than running off one edge.

                        `soft-light` rather than `color-dodge`: dodge brightens
                        towards white, which blew out exactly the pale panel a
                        card prints its rules text on. Soft light shifts the hue
                        while leaving the light and dark of the artwork where
                        they were, so the text underneath keeps its contrast. */}
                    <span
                        aria-hidden={true}
                        className={clsx(
                            "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light transition-opacity duration-300",
                            "bg-[conic-gradient(from_180deg_at_50%_50%,#f0abfc_0deg,#67e8f9_70deg,#fde68a_140deg,#86efac_210deg,#93c5fd_280deg,#f0abfc_360deg)]",
                            compact
                                ? "opacity-60 group-hover/foil:opacity-85"
                                : "opacity-45 group-hover/foil:opacity-70",
                        )}
                    />
                    {/* Diagonal bands. At thumbnail size a single soft sweep
                        averages out into a wash, so the small variant repeats
                        the highlight — but faintly: banding that announces
                        itself reads as a pattern printed over the card rather
                        than as light falling on it. */}
                    <span
                        aria-hidden={true}
                        className={clsx(
                            "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay",
                            compact
                                ? "bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.3)_0px,rgba(255,255,255,0)_10px,rgba(255,255,255,0.2)_20px)] opacity-45"
                                : "bg-[linear-gradient(105deg,transparent_32%,rgba(255,255,255,0.45)_47%,rgba(255,255,255,0.14)_55%,transparent_68%)] opacity-55",
                        )}
                    />
                </>
            )}

            {finish === "Etched" && (
                // Etched foil has no rainbow: it is a metallic relief, so this
                // is cold silver rather than colour.
                <span
                    aria-hidden={true}
                    className={clsx(
                        "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay transition-opacity duration-300",
                        compact
                            ? "bg-[repeating-linear-gradient(115deg,rgba(226,232,240,0.5)_0px,rgba(148,163,184,0)_9px,rgba(203,213,225,0.4)_18px)] opacity-60 group-hover/foil:opacity-80"
                            : "bg-[linear-gradient(115deg,transparent_28%,rgba(226,232,240,0.7)_45%,rgba(148,163,184,0.9)_50%,rgba(226,232,240,0.7)_55%,transparent_72%)] opacity-65 group-hover/foil:opacity-85",
                    )}
                />
            )}
        </span>
    );
}
