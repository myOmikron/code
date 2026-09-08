import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

/** The radius the ring is drawn at, inside a viewbox 100 wide */
const RADIUS = 42;

/** How thick the ring is drawn, in the same units */
const WIDTH = 10;

/** How far around the ring is, which is the length the stroke is dashed over */
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The properties for {@link SpindownRing}
 */
export type SpindownRingProps = {
    /** How long the ring takes to run out, in milliseconds */
    duration: number;
    /** How the ring is drawn */
    className?: string;
    /** What the ring wraps */
    children: ReactNode;
};

/**
 * A ring that empties over a fixed time, wrapped around whatever it is given.
 *
 * Named after the die it borrows from: something that only counts down, and is
 * read at a glance by how much of it is left rather than by a number. It sits
 * behind an offer that expires, so a player can see the offer running out
 * instead of watching it vanish under their thumb.
 *
 * The drain is handed to the browser rather than counted out in state: it runs
 * once, off the compositor, and a tile that four people are tapping at the same
 * time never re-renders for it.
 *
 * @returns the ring, with its contents in the middle
 */
export function SpindownRing({ duration, className, children }: SpindownRingProps) {
    const arc = useRef<SVGCircleElement>(null);

    useEffect(() => {
        const animation = arc.current?.animate?.([{ strokeDashoffset: 0 }, { strokeDashoffset: CIRCUMFERENCE }], {
            duration,
            easing: "linear",
            fill: "forwards",
        });
        return () => animation?.cancel();
    }, [duration]);

    return (
        <span className={clsx("relative flex aspect-square items-center justify-center", className)}>
            <svg viewBox={"0 0 100 100"} aria-hidden={true} className={"absolute inset-0 size-full -rotate-90"}>
                <circle cx={50} cy={50} r={RADIUS} fill={"none"} strokeWidth={WIDTH} className={"stroke-white/20"} />
                <circle
                    ref={arc}
                    cx={50}
                    cy={50}
                    r={RADIUS}
                    fill={"none"}
                    strokeWidth={WIDTH}
                    strokeLinecap={"round"}
                    strokeDasharray={CIRCUMFERENCE}
                    className={"stroke-white"}
                />
            </svg>
            <span className={"relative flex items-center justify-center"}>{children}</span>
        </span>
    );
}
