import clsx from "clsx";
import { useReducedMotion } from "motion/react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Classes every panel handed to {@link DeckAdvisorPanelRail} has to carry.
 *
 * A definite width, not a minimum: a flex item left at `basis: auto` takes its
 * content's max-content width, and a panel holding one long unwrappable line —
 * the themes panel's held-open hover captions, say — quietly grows to three
 * screens wide and takes its chart with it. `min-w-0` closes the same door on
 * the min-content side.
 */
export const RAIL_ITEM = "w-[84%] min-w-0 shrink-0 snap-start sm:w-auto sm:shrink";

/** How far the hint pushes the rail, in pixels — a peek, not a page */
const HINT_DISTANCE = 56;

/** Out, then back. Out is the quicker half: the return is the resting state. */
const HINT_OUT_MS = 520;
const HINT_BACK_MS = 660;

/** Long enough for the panels to have laid out, short enough to still read as arrival */
const HINT_DELAY_MS = 450;

/**
 * The properties for {@link DeckAdvisorPanelRail}
 */
export type DeckAdvisorPanelRailProps = {
    /**
     * Where the "this has been shown" flag lives in `localStorage`.
     *
     * Per browser rather than per deck: the rail behaves the same on every
     * deck, so a reader who has understood it once does not need telling
     * again — and a nudge that fires on every deck reads as a glitch.
     */
    hintKey: string;
    /** What the panels lay out as from `sm` up, where the rail is a grid */
    gridClassName: string;
    /** Names the region for anyone who cannot see it is a rail */
    label: string;
    /** The panels, each carrying {@link RAIL_ITEM} */
    children: React.ReactNode;
};

/**
 * The cockpit's panels: a snapping rail on a phone, the usual grid above `sm`.
 *
 * Four full-height panels stacked vertically is most of a screen each and
 * pushes the exchanges — the thing the page is actually for — three swipes
 * down. Side by side they cost one gesture instead, at 84% width so the next
 * one is always cut off by the right edge: the panel that is half visible is
 * the affordance, and the dots below say how many there are.
 *
 * A cut-off edge only reads as scrollable once you have seen one, so the
 * first visit gets shown. The rail slides out and settles back, once per
 * browser, and only when there is really something to scroll to — which is
 * also what keeps it off the grid, where the same markup does not scroll at
 * all.
 *
 * @returns the rail
 */
export function DeckAdvisorPanelRail({ hintKey, gridClassName, label, children }: DeckAdvisorPanelRailProps) {
    const [t] = useTranslation("advisor");
    const railRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(0);
    // Honours the OS setting the same way the rest of the page does — the
    // hint is an explanation, and an explanation nobody asked to see move is
    // exactly what that setting is about.
    const reduced = useReducedMotion();

    // `toArray` drops the `false` a conditional panel leaves behind, which a
    // plain child count would draw a dot for.
    const panels = React.Children.toArray(children);

    // Which panel the rail has come to rest on. Nearest centre rather than
    // scroll position over width: the last panel never reaches the left edge,
    // so its dot would never light up.
    useEffect(() => {
        const rail = railRef.current;
        if (rail === null) return;

        let frame = 0;
        const measure = () => {
            frame = 0;
            const middle = rail.scrollLeft + rail.clientWidth / 2;
            let nearest = 0;
            let best = Infinity;
            for (let i = 0; i < rail.children.length; i++) {
                const panel = rail.children[i] as HTMLElement;
                const distance = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - middle);
                if (distance < best) {
                    best = distance;
                    nearest = i;
                }
            }
            setActive(nearest);
        };
        const onScroll = () => {
            if (frame === 0) frame = requestAnimationFrame(measure);
        };

        rail.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            rail.removeEventListener("scroll", onScroll);
            if (frame !== 0) cancelAnimationFrame(frame);
        };
    }, []);

    // The one-time hint.
    useEffect(() => {
        const rail = railRef.current;
        if (rail === null || reduced === true) return;
        // A grid does not overflow, so this is also the breakpoint check:
        // there is nothing to hint at when everything is already on screen.
        if (rail.scrollWidth <= rail.clientWidth + 8) return;
        // Storage can throw outright (Safari, private mode); a hint is not
        // worth taking the page down for.
        try {
            if (window.localStorage.getItem(hintKey) !== null) return;
            window.localStorage.setItem(hintKey, "1");
        } catch {
            return;
        }

        let frame = 0;
        let start = 0;
        let cancelled = false;
        // Exponential ease-out, from a rail that is already where it belongs.
        const ease = (progress: number) => 1 - Math.pow(2, -10 * progress);

        const step = (now: number) => {
            if (cancelled) return;
            if (start === 0) start = now;
            const elapsed = now - start;
            if (elapsed < HINT_OUT_MS) {
                rail.scrollLeft = HINT_DISTANCE * ease(elapsed / HINT_OUT_MS);
                frame = requestAnimationFrame(step);
            } else if (elapsed < HINT_OUT_MS + HINT_BACK_MS) {
                rail.scrollLeft = HINT_DISTANCE * (1 - ease((elapsed - HINT_OUT_MS) / HINT_BACK_MS));
                frame = requestAnimationFrame(step);
            } else {
                rail.scrollLeft = 0;
            }
        };

        // Whoever touches the rail has understood it; finishing the
        // demonstration over their thumb would only fight them for it.
        const stop = () => {
            cancelled = true;
            if (frame !== 0) cancelAnimationFrame(frame);
        };
        rail.addEventListener("pointerdown", stop);
        rail.addEventListener("wheel", stop, { passive: true });
        rail.addEventListener("touchstart", stop, { passive: true });

        const timer = window.setTimeout(() => {
            frame = requestAnimationFrame(step);
        }, HINT_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
            stop();
            rail.removeEventListener("pointerdown", stop);
            rail.removeEventListener("wheel", stop);
            rail.removeEventListener("touchstart", stop);
        };
    }, [hintKey, reduced]);

    /**
     * Brings one panel to the left edge, for the dots
     *
     * @param index which panel to scroll to
     */
    function show(index: number) {
        const rail = railRef.current;
        const panel = rail?.children[index] as HTMLElement | undefined;
        if (rail === undefined || rail === null || panel === undefined) return;
        rail.scrollTo({ left: panel.offsetLeft - rail.offsetLeft, behavior: reduced === true ? "auto" : "smooth" });
    }

    return (
        <div className={"flex flex-col gap-3"}>
            {/* Bled to the page's own gutter below `sm`, so the panel on the
                right is cut off by the screen rather than floating short of
                it — an edge that stops early reads as the end of the list.
                The gutter comes back as scroll padding, which is what the
                snap points line up against.

                Two, not six: the layout holds 24px back but the deck page
                already pulls 16 of those in (`-mx-4` in `_deck.tsx`), so 8px
                is all that is left to reclaim — any more and the rail pokes
                past the viewport, handing the whole page a sideways wiggle. */}
            <div
                ref={railRef}
                role={"group"}
                aria-label={label}
                className={clsx(
                    "-mx-2 flex snap-x snap-mandatory scroll-px-2 gap-3 overflow-x-auto px-2 pb-1",
                    // No scrollbar under the panels: the dots already say
                    // where the rail is, and a phone draws none anyway.
                    "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                    "sm:mx-0 sm:snap-none sm:scroll-px-0 sm:overflow-visible sm:px-0 sm:pb-0",
                    gridClassName,
                )}
            >
                {children}
            </div>

            {panels.length > 1 && (
                <div className={"flex justify-center gap-1.5 sm:hidden"}>
                    {panels.map((_, index) => (
                        <button
                            key={index}
                            type={"button"}
                            onClick={() => show(index)}
                            aria-label={t("accessibility.show-panel", { number: index + 1 })}
                            aria-current={index === active}
                            className={
                                "flex h-6 w-4 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
                            }
                        >
                            {/* The tap target is the button; this is only what
                                it looks like. A 6px dot is not a touch
                                target, and four of them in a row at 6px would
                                be four ways to miss. */}
                            <span
                                className={clsx(
                                    "h-1.5 rounded-(--radius-pill) transition-all duration-200",
                                    index === active ? "w-4 bg-(--color-accent)" : "w-1.5 bg-zinc-300 dark:bg-zinc-600",
                                )}
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
