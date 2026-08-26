import clsx from "clsx";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { hapticTap } from "src/utils/haptics";

/** How long a press has to last before it stops being a single tap */
const HOLD_DELAY = 450;

/** How often a held button keeps going */
const HOLD_INTERVAL = 700;

/**
 * The properties for {@link CounterButton}
 */
export type CounterButtonProps = {
    /** What a tap is worth */
    amount: number;
    /** What every step of a hold is worth */
    hold: number;
    /** What the button does, for screen readers */
    label: string;
    /** What holding it does, as a tooltip */
    title?: string;
    /** How the button is drawn */
    className?: string;
    /** What it shows */
    children: ReactNode;
    /** Books the change */
    onChange: (amount: number) => void;
};

/**
 * A button that counts once on a tap and keeps counting while it is held.
 *
 * Every button keeps its own timers, so several players hitting their tiles at
 * the same time never take each other's press.
 *
 * @returns the button
 */
export function CounterButton({ amount, hold, label, title, className, children, onChange }: CounterButtonProps) {
    const timers = useRef<{ timeout?: number; interval?: number }>({});
    const repeating = useRef(false);

    const stop = useCallback(() => {
        if (timers.current.timeout !== undefined) window.clearTimeout(timers.current.timeout);
        if (timers.current.interval !== undefined) window.clearInterval(timers.current.interval);
        timers.current = {};
    }, []);

    useEffect(() => stop, [stop]);

    /**
     * Takes the button down and starts counting for a hold
     *
     * @param event the pointer that went down
     */
    function press(event: ReactPointerEvent<HTMLButtonElement>) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        repeating.current = false;
        timers.current.timeout = window.setTimeout(() => {
            repeating.current = true;
            step(hold);
            timers.current.interval = window.setInterval(() => step(hold), HOLD_INTERVAL);
        }, HOLD_DELAY);
    }

    /**
     * Lets the button go, counting the tap a hold has not already counted
     *
     * @param cancelled whether the pointer was taken away rather than lifted
     */
    function release(cancelled: boolean) {
        const held = repeating.current;
        repeating.current = false;
        stop();
        if (!cancelled && !held) step(amount);
    }

    /**
     * Books a change and lets the thumb feel it
     *
     * @param value what to count
     */
    function step(value: number) {
        hapticTap();
        onChange(value);
    }

    return (
        <button
            type={"button"}
            aria-label={label}
            title={title}
            onPointerDown={press}
            onPointerUp={() => release(false)}
            onPointerCancel={() => release(true)}
            onContextMenu={(event) => event.preventDefault()}
            className={clsx(
                "flex touch-none flex-col items-center justify-center font-light transition hover:bg-white/10 active:bg-white/25",
                className,
            )}
        >
            {children}
        </button>
    );
}
