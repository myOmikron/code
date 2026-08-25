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
    /**
     * The same artwork the children show, as a url.
     *
     * Only the tilting sheen wants it, and only to work out where the card is
     * worth lighting up — see {@link SATURATION_KEY}. Left out, the card keeps
     * every other layer and loses just that one.
     */
    image?: string | null;
    /** The artwork to lay the sheen over */
    children: ReactNode;
};

/**
 * The layer that only exists while the phone is being tilted.
 *
 * `.foil-tilt` lands on `<html>` the moment a real reading arrives (see
 * `src/utils/foil-tilt.ts`), and this comes *on top of* the still sheen rather
 * than replacing it: the still one is what a foil looks like, and this is the
 * only thing a still one cannot do.
 *
 * It paints nothing at all. Every version of this that drew a band ended up
 * with a band you could see — a bright stripe lying on the card, which is not
 * what a foil looks like from across a table. What a foil actually does is far
 * quieter: the saturated parts of the artwork swing in hue as it turns, and the
 * dull parts sit there. So this filters the backdrop instead of covering it,
 * and a soft mask decides where. `hue-rotate` cannot touch a grey — grey has no
 * hue to turn — and `saturate` multiplies a saturation of zero by anything and
 * gets zero, so the rules panel and the black border stay exactly as they are,
 * for free, without a mask ever having to know where they are.
 *
 * The box is three times the card's and is moved in percentages of itself, so a
 * stamp and a full-bleed portrait sweep by the same fraction without either
 * knowing its own size. That size is also what keeps the layer's own edge off
 * the artwork: a card of margin on each side against `TRAVEL`, which is 14% of
 * the layer and so 42% of the card. The frame's `overflow-hidden` does the
 * clipping, rounding included.
 */
const TILT_LAYER = "pointer-events-none absolute -inset-[100%] hidden [.foil-tilt_&]:block";

/**
 * Two copies of the artwork, which together are a map of where its colour is.
 *
 * A foil blows out to white where the print is vivid and does nothing at all
 * over the rules text, and that is the one thing no CSS filter can be told:
 * `brightness` lifts every pixel it is given, grey card stock included, which
 * is why a bright core over a soft mask reads as a searchlight crossing the
 * whole card rather than as a foil catching.
 *
 * So the card says where. Laid over itself with the top copy greyed out and
 * blended `difference`, what comes out is |colour − its own grey|: black
 * wherever the artwork is grey, bright wherever it is saturated, and neither
 * of those needs to be found first. That result is then what dodges the card
 * underneath, so the glow can only land where there was colour to begin with.
 *
 * Both copies are the file the `<img>` above already fetched, so this costs a
 * cache hit and no request. They sit at the middle third of the oversized layer
 * — the card's own box — and are moved back by three times what their parent is
 * moved by, so the band travels while the artwork stays where the card is.
 */
const SATURATION_KEY = clsx(
    "pointer-events-none absolute inset-[33.3333%] bg-cover bg-center",
    "[transform:translate3d(calc(var(--foil-tx,0%)*-3),calc(var(--foil-ty,0%)*-3),0)]",
);

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
 * There are two sheens here and only ever one of them on screen: the still one,
 * for a card on a desk where the pointer is the only thing that moves, and the
 * one built from {@link TILT_LAYER}s — a band and its highlight — for a card in
 * a hand, where the phone is.
 *
 * Everything the tilt drives is a transform — the compositor's work, not the
 * painter's. Feeding the angle into the colour stops instead would redraw every
 * gradient on the page sixty times a second, and a grid of foils would crawl.
 *
 * @returns the framed artwork
 */
export function FoilFrame({ finish, className, compact = false, image, children }: FoilFrameProps) {
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

                    {/* The band, and there is nothing here to see it by. The
                        mask is the band: soft over most of a card's width, so
                        nowhere along it does an edge arrive, and what lies under
                        the thick part of it comes up in colour as it passes. A
                        grey does nothing whatsoever, because multiplying a
                        saturation of zero leaves zero — the rules panel and the
                        border need no mask of their own to be left alone.

                        Saturation does nearly all of it and hue barely any, and
                        that split is what a face costs: skin sits where red and
                        green are a few degrees apart, so a rotation big enough
                        to be worth having anywhere else walks a portrait from
                        sunburn to seasick. Ten degrees is under that, and the
                        colour that is missing comes back as depth instead.

                        Both are variables so they can be turned without a build:
                        `document.documentElement.style.setProperty("--foil-sat",
                        "2.4")` on the device, and the defaults here are what a
                        page starts with. */}
                    <span
                        aria-hidden={true}
                        className={clsx(
                            TILT_LAYER,
                            "backdrop-hue-rotate-[var(--foil-hue,10deg)] backdrop-saturate-[var(--foil-sat,2.2)]",
                            "[transform:translate3d(var(--foil-tx,0%),var(--foil-ty,0%),0)]",
                            "[mask-image:linear-gradient(104deg,transparent_34%,rgba(0,0,0,0.5)_42%,#000_50%,rgba(0,0,0,0.5)_58%,transparent_66%)]",
                            "[-webkit-mask-image:linear-gradient(104deg,transparent_34%,rgba(0,0,0,0.5)_42%,#000_50%,rgba(0,0,0,0.5)_58%,transparent_66%)]",
                        )}
                    />
                    {image != null && (
                        <span
                            aria-hidden={true}
                            className={clsx(
                                TILT_LAYER,
                                "isolate opacity-70 mix-blend-color-dodge",
                                // The gain on the key, and the reason it can be
                                // turned up freely: brightness multiplies, and
                                // whatever it multiplies a zero by is still a
                                // zero. Grey card stock keeps its exact black in
                                // the key however hard this is driven, so all
                                // this moves is how much colour a spot needs
                                // before it starts to catch. Tunable live as
                                // `--foil-key`.
                                "[filter:brightness(var(--foil-key,2.4))]",
                                "[transform:translate3d(var(--foil-tx,0%),var(--foil-ty,0%),0)]",
                                "[mask-image:linear-gradient(104deg,transparent_34%,rgba(0,0,0,0.45)_44%,#000_50%,rgba(0,0,0,0.45)_56%,transparent_66%)]",
                                "[-webkit-mask-image:linear-gradient(104deg,transparent_34%,rgba(0,0,0,0.45)_44%,#000_50%,rgba(0,0,0,0.45)_56%,transparent_66%)]",
                            )}
                        >
                            <span className={SATURATION_KEY} style={{ backgroundImage: `url(${image})` }} />
                            <span
                                className={clsx(SATURATION_KEY, "mix-blend-difference grayscale")}
                                style={{ backgroundImage: `url(${image})` }}
                            />
                        </span>
                    )}
                </>
            )}

            {finish === "Etched" && (
                <>
                    {/* Etched foil has no rainbow: it is a metallic relief, so
                        this is cold silver rather than colour. */}
                    <span
                        aria-hidden={true}
                        className={clsx(
                            "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay transition-opacity duration-300",
                            compact
                                ? "bg-[repeating-linear-gradient(115deg,rgba(226,232,240,0.5)_0px,rgba(148,163,184,0)_9px,rgba(203,213,225,0.4)_18px)] opacity-60 group-hover/foil:opacity-80"
                                : "bg-[linear-gradient(115deg,transparent_28%,rgba(226,232,240,0.7)_45%,rgba(148,163,184,0.9)_50%,rgba(226,232,240,0.7)_55%,transparent_72%)] opacity-65 group-hover/foil:opacity-85",
                        )}
                    />

                    {/* The same invisible band over an etched card, and here it
                        cannot be a hue: the finish has no colour to turn. What
                        moves instead is the metal's own contrast, which is the
                        other half of what a relief does in changing light. */}
                    <span
                        aria-hidden={true}
                        className={clsx(
                            TILT_LAYER,
                            "backdrop-brightness-[1.07] backdrop-contrast-[1.08]",
                            "[transform:translate3d(var(--foil-tx,0%),var(--foil-ty,0%),0)]",
                            "[mask-image:linear-gradient(115deg,transparent_34%,rgba(0,0,0,0.5)_42%,#000_50%,rgba(0,0,0,0.5)_58%,transparent_66%)]",
                            "[-webkit-mask-image:linear-gradient(115deg,transparent_34%,rgba(0,0,0,0.5)_42%,#000_50%,rgba(0,0,0,0.5)_58%,transparent_66%)]",
                        )}
                    />
                </>
            )}
        </span>
    );
}
