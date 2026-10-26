import { useEffect, useState } from "react";
import type { ClockReading } from "src/utils/round-clock";
import { readClock } from "src/utils/round-clock";

/** The shortest a tick is scheduled for, so a strange reading cannot spin */
const MIN_TICK_MS = 200;

/**
 * A round timer, read again whenever its shown second changes
 *
 * Each tick is a `setTimeout` aimed at the next change and read from the end,
 * so it does not drift, and a tab coming back from the background is right at once.
 *
 * @param endsAt when time is up, as the API sends it
 * @param skewMs how far this device's clock is ahead of the server's
 *
 * @returns what the timer reads right now
 */
export function useRoundClock(endsAt: string, skewMs: number): ClockReading {
    const [reading, setReading] = useState<ClockReading>(() => readClock(endsAt, Date.now(), skewMs));

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = () => {
            const now = Date.now();
            const next = readClock(endsAt, now, skewMs);
            setReading(next);
            if (next.timeUp) return;
            const untilChange = (Date.parse(endsAt) - (now - skewMs)) % 1000;
            timer = setTimeout(tick, Math.max(untilChange || 1000, MIN_TICK_MS));
        };
        tick();

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
    }, [endsAt, skewMs]);

    return reading;
}
