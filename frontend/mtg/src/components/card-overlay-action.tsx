import { ArrowPathIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import type { ComponentType } from "react";

/**
 * How much artwork the chip covers.
 *
 * `sm` is the corner mark that rides on a card permanently — flipping it over,
 * opening it on Cardmarket. `md` is the one action a surface exists to make
 * happen, revealed in the middle of the picture.
 */
export type CardOverlayActionSize = "sm" | "md";

/** The chip's padding and the icon it draws, per size */
const SIZES: Record<CardOverlayActionSize, { chip: string; icon: string }> = {
    sm: { chip: "p-1.5", icon: "size-5" },
    md: { chip: "p-3", icon: "size-6" },
};

/**
 * Which corner of the artwork a chip is pinned to.
 *
 * `inline` pins it nowhere: the caller has put it in a row of its own — beside
 * the Cardmarket link, in a table cell, in the middle of a suggestion — and
 * owns where that row sits.
 */
export type CardOverlayPosition = "inline" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Which mark down the corner this is.
 *
 * A corner is a stack, not a spot. The deck grid's count badge holds the top
 * right of every tile and only appears above one copy, so the flip below it
 * takes slot 1 whether or not the count is drawn — a chip that slid up when a
 * quantity dropped to one would move under the reader's pointer.
 */
export type CardOverlaySlot = 0 | 1 | 2;

/**
 * The corners, one class per slot down each of them.
 *
 * Spelled out because Tailwind reads its class names out of the source and
 * never sees an inset put together at runtime. The step between slots is the
 * small chip plus the gap the other markers keep — 2.5rem — which is where the
 * deck grid's hand-written `top-12` came from.
 */
const PLACEMENTS: Record<Exclude<CardOverlayPosition, "inline">, Record<CardOverlaySlot, string>> = {
    "top-left": { 0: "absolute top-2 left-2", 1: "absolute top-12 left-2", 2: "absolute top-22 left-2" },
    "top-right": { 0: "absolute top-2 right-2", 1: "absolute top-12 right-2", 2: "absolute top-22 right-2" },
    "bottom-left": { 0: "absolute bottom-2 left-2", 1: "absolute bottom-12 left-2", 2: "absolute bottom-22 left-2" },
    "bottom-right": {
        0: "absolute bottom-2 right-2",
        1: "absolute bottom-12 right-2",
        2: "absolute bottom-22 right-2",
    },
};

/**
 * The properties for {@link CardOverlayAction}
 */
export type CardOverlayActionProps = {
    /** The mark it wears, swapped for a spinner while {@link busy} */
    icon: ComponentType<{ className?: string }>;
    /** What pressing it does, for a `title` and for screen readers */
    label: string;
    /** Does it */
    onClick: () => void;
    /** How much artwork it covers, a corner mark by default */
    size?: CardOverlayActionSize;
    /** Whether it is a toggle currently on, which also gives it `aria-pressed` */
    active?: boolean;
    /** Whether its action is in flight, which spins the chip and blocks it */
    busy?: boolean;
    /** Whether it cannot be pressed at all */
    disabled?: boolean;
    /** Whether it sits in a row of text rather than on artwork, dropping the lift */
    flat?: boolean;
    /** Which corner of the artwork it is pinned to, none by default */
    position?: CardOverlayPosition;
    /** Which mark down that corner it is, the outermost by default */
    slot?: CardOverlaySlot;
    /** Anything else the caller needs on it */
    className?: string;
};

/**
 * One action laid on a card's artwork.
 *
 * Every view in the app drops the same chip on the same pictures — a near-black
 * disc, white mark, white ring, blurred behind — for turning a card over, for
 * opening it on Cardmarket, for saying how many copies are in the pile. This is
 * that chip as one component, so an action added to artwork tomorrow looks like
 * the ones already there instead of inventing a fourth near-black disc.
 *
 * Grey and translucent rather than accent-coloured on purpose: these sit on
 * photographs the reader is choosing by, and a saturated fill over artwork
 * fights the card for attention while a dimmed disc borrows the card's own
 * colours through the blur. An accent fill is reserved for {@link active}, where
 * it says the toggle is on — the one time the chip reports state instead of
 * offering an action.
 *
 * It lays over the artwork but is never nested inside it: every card view makes
 * its picture a button that opens the card, and a button inside a button is not
 * markup a browser agrees on. Callers place this as a sibling and position it
 * through `className`. The click is stopped from travelling for the same
 * reason — a row that opens a card on click must not also open it because the
 * reader turned the card over.
 *
 * @returns the button
 */
export function CardOverlayAction({
    icon,
    label,
    onClick,
    size = "sm",
    active,
    busy = false,
    disabled = false,
    flat = false,
    position = "inline",
    slot = 0,
    className,
}: CardOverlayActionProps) {
    const chip = SIZES[size];
    const Icon = busy ? ArrowPathIcon : icon;

    return (
        <button
            type={"button"}
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled || busy}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            className={clsx(
                // The focus ring is the accent, as it is on every other control
                // in the app — and it has to be something other than white,
                // because the chip already wears a white ring at rest and a
                // white outline outside it would read as the same halo.
                "inline-flex items-center justify-center rounded-full text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:opacity-50",
                chip.chip,
                position !== "inline" && PLACEMENTS[position][slot],
                active === true ? "bg-(--color-brand-600) hover:bg-(--color-brand-500)" : "bg-zinc-950/75",
                // The white ring is what holds the chip off artwork it happens
                // to match, and the blur lets the picture's own colours through
                // rather than stamping a flat disc on it.
                flat === false &&
                    "z-10 shadow-lg ring-2 ring-white/75 backdrop-blur-sm hover:scale-105 active:scale-95 disabled:hover:scale-100",
                active !== true && "hover:bg-zinc-950/90",
                className,
            )}
        >
            <Icon className={clsx(chip.icon, busy && "animate-spin")} aria-hidden={true} />
        </button>
    );
}
