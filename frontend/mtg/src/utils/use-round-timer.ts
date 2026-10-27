import { useEffect, useState } from "react";
import type { TimerReading, TimerSnapshot } from "src/utils/round-timer";
import { heldTimer, readRunningTimer, readTimer } from "src/utils/round-timer";

/** The shortest a tick is scheduled for, so a strange reading cannot spin */
const MIN_TICK_MS = 200;

/**
 * A round timer, read again whenever its shown second changes
 *
 * Each tick is a `setTimeout` aimed at the next change and read from the end,
 * so it does not drift, and a tab coming back from the background is right at once.
 * A paused timer does not tick; it shows what the server answered.
 *
 * @param timer the round timer, as the API sends it
 * @param skewMs how far this device's clock is ahead of the server's
 *
 * @returns what the timer reads right now
 */
export function useRoundTimer(timer: TimerSnapshot, skewMs: number): TimerReading {
    const [reading, setReading] = useState<TimerReading>(() => readTimer(timer, Date.now(), skewMs));
    const held = heldTimer(timer);
    const endsAt = timer.ends_at;
    const paused = held !== null;

    useEffect(() => {
        if (paused) return;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const tick = () => {
            const now = Date.now();
            const next = readRunningTimer(endsAt, now, skewMs);
            setReading(next);
            if (next.timeUp) return;
            const untilChange = (Date.parse(endsAt) - (now - skewMs)) % 1000;
            timeout = setTimeout(tick, Math.max(untilChange || 1000, MIN_TICK_MS));
        };
        tick();

        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            clearTimeout(timeout);
            tick();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [endsAt, skewMs, paused]);

    return held ?? reading;
}
