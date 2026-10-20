import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/** How often each surface looks for a change, in milliseconds, before jitter */
export const PULSE_INTERVALS = {
    /** The desk, where a phone's report should appear promptly */
    staff: 8_000,
    /** A player, whose own table and its confirmation are all that move */
    player: 15_000,
    /** The standings, which only change when a result is entered */
    standings: 30_000,
    /** The roster while people are still arriving */
    roster: 20_000,
    /** A wall, not a workstation */
    display: 10_000,
} as const;

/** How far either side of the interval a tick may land, as a fraction */
const JITTER = 0.15;

/** How many times the interval may grow while requests keep failing */
const MAX_BACKOFF = 4;

/** How many failures in a row before the page admits it is out of date */
const STALE_AFTER = 2;

/** The options for {@link useTournamentPulse} */
export type TournamentPulseOptions = {
    /** How often to look, in milliseconds — see {@link PULSE_INTERVALS} */
    interval: number;
    /** Off for a finished event or a page with nothing live on it */
    enabled?: boolean;
    /** Whether something on screen is mid-edit; a pulse never lands on top of one */
    busy?: () => boolean;
};

/** What {@link useTournamentPulse} hands back */
export type TournamentPulse = {
    /** Whether the last few attempts failed */
    stale: boolean;
    /** Looks now */
    refresh: () => Promise<void>;
};

/**
 * Keeps a tournament page up to date by re-running its loaders (`router.invalidate()`)
 *
 * Ticks are jittered so a room of phones does not poll in lockstep, back off while failing, and
 * are skipped (not queued) while `busy` reports an edit in progress.
 *
 * @param options how often to look, and when not to
 * @param options.interval how often to look, in milliseconds
 * @param options.enabled whether to look at all
 * @param options.busy whether something on screen is mid-edit
 *
 * @returns whether the page is behind, and a way to catch up now
 */
export function useTournamentPulse({ interval, enabled = true, busy }: TournamentPulseOptions): TournamentPulse {
    const router = useRouter();
    const [stale, setStale] = useState(false);
    const failures = useRef(0);
    const busyRef = useRef(busy);
    busyRef.current = busy;

    const refresh = useCallback(async () => {
        try {
            await router.invalidate();
            failures.current = 0;
            setStale(false);
        } catch {
            failures.current += 1;
            if (failures.current >= STALE_AFTER) setStale(true);
        }
    }, [router]);

    useEffect(() => {
        if (!enabled) return;

        let timer: ReturnType<typeof setTimeout> | undefined;

        const schedule = () => {
            const backoff = Math.min(2 ** failures.current, MAX_BACKOFF);
            const spread = 1 + (Math.random() * 2 - 1) * JITTER;
            timer = setTimeout(tick, interval * backoff * spread);
        };

        const tick = () => {
            if (busyRef.current?.() === true) {
                schedule();
                return;
            }
            void refresh().finally(schedule);
        };

        schedule();

        const onVisible = () => {
            clearTimeout(timer);
            if (document.visibilityState === "visible") tick();
        };
        const onOnline = () => {
            failures.current = 0;
            clearTimeout(timer);
            tick();
        };

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", onOnline);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("online", onOnline);
        };
    }, [enabled, interval, refresh]);

    return { stale, refresh };
}
