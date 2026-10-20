import { useEffect, useState } from "react";
import type { ClockReading, RoundClock } from "src/utils/round-clock";
import { readClock } from "src/utils/round-clock";

/** The shortest a tick may be scheduled for, so a pathological reading cannot spin */
const MIN_TICK_MS = 200;

/** What a missing clock reads */
const IDLE: ClockReading = { seconds: 0, started: false, paused: false, over: false };

/**
 * A round's clock, re-read whenever its displayed second flips
 *
 * Each tick is a `setTimeout` aimed at the next flip and recomputed from the deadline, so it does
 * not drift and a backgrounded tab comes back correct.
 *
 * @param clock the round's three fields, or `null` when there is no round
 * @param skewMs how far this device's clock is ahead of the server's
 *
 * @returns what the clock reads right now
 */
export function useRoundClock(clock: RoundClock | null, skewMs: number): ClockReading {
    const [reading, setReading] = useState<ClockReading>(() =>
        clock === null ? IDLE : readClock(clock, Date.now(), skewMs),
    );

    useEffect(() => {
        if (clock === null) {
            setReading(IDLE);
            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = () => {
            const now = Date.now();
            const next = readClock(clock, now, skewMs);
            setReading(next);

            if (!next.started || next.paused) return;

            const endsAt = Date.parse(clock.endsAt ?? "");
            const untilFlip = (((endsAt - (now - skewMs)) % 1000) + 1000) % 1000;
            timer = setTimeout(tick, Math.max(untilFlip || 1000, MIN_TICK_MS));
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
    }, [clock, skewMs]);

    return reading;
}
