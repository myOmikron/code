import { useEffect, useState } from "react";
import type { ClockReading, RoundClock } from "src/utils/round-clock";
import { readClock } from "src/utils/round-clock";

/** The shortest a tick may be scheduled for, so a pathological reading cannot spin */
const MIN_TICK_MS = 200;

/**
 * A round's clock, re-read once a second
 *
 * The tick is a self-correcting `setTimeout` aimed at the instant the displayed second actually
 * changes, rather than either of the obvious alternatives. `requestAnimationFrame` would wake sixty
 * times a second for a value that changes once, and is throttled to nothing when the tab is hidden.
 * A plain `setInterval(1000)` drifts, and — worse — fires at an arbitrary phase, so the face sits
 * on `2:00` for nearly two seconds and then skips one.
 *
 * Because every tick recomputes from the deadline rather than subtracting from a running total, a
 * backgrounded tab, a sleeping phone and a restored session all come back correct with no special
 * handling; the only thing `visibilitychange` does here is stop waiting.
 *
 * @param clock the round's three fields, or `null` when there is no round
 * @param skewMs how far this device's clock is ahead of the server's
 *
 * @returns what the clock reads right now
 */
export function useRoundClock(clock: RoundClock | null, skewMs: number): ClockReading {
    const [reading, setReading] = useState<ClockReading>(() =>
        clock === null
            ? { seconds: 0, started: false, paused: false, over: false }
            : readClock(clock, Date.now(), skewMs),
    );

    useEffect(() => {
        if (clock === null) {
            setReading({ seconds: 0, started: false, paused: false, over: false });
            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = () => {
            const now = Date.now();
            const next = readClock(clock, now, skewMs);
            setReading(next);

            // A paused or unstarted clock has nothing to count, so it waits for a prop change
            // rather than waking every second for the same answer.
            if (!next.started || next.paused) return;

            // Aim at the moment the displayed second flips, not a second from now — that is what
            // keeps the face from drifting a little further out of step on every tick.
            const endsAt = Date.parse(clock.endsAt ?? "");
            const untilFlip = (((endsAt - (now - skewMs)) % 1000) + 1000) % 1000;
            timer = setTimeout(tick, Math.max(untilFlip || 1000, MIN_TICK_MS));
        };

        tick();

        // Coming back to a tab is exactly when the reading is most stale, so it is re-read at
        // once rather than at the next scheduled tick.
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            clearTimeout(timer);
            tick();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [clock, skewMs]);

    return reading;
}
