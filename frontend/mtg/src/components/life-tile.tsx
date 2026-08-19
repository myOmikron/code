import clsx from "clsx";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Seat, SeatPlacement } from "src/utils/life-tracker";

/** How long a press has to last before it stops being a single point */
const HOLD_DELAY = 450;

/** How often a held button keeps going */
const HOLD_INTERVAL = 700;

/** What a held button is worth per step */
const HOLD_STEP = 10;

/**
 * The player's own frame, laid over the tile.
 *
 * A quarter turn swaps the two sides, so the turned frames are sized in the
 * tile's container units and rotated around their centre: the frame ends up
 * covering the tile exactly, and everything inside it is laid out (and
 * clipped) in reading order rather than sticking out of the tile.
 */
const FRAME: Record<Seat, string> = {
    top: "inset-0 rotate-180",
    bottom: "inset-0",
    left: "top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 rotate-90",
    right: "top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 -rotate-90",
};

/**
 * The properties for {@link LifeTile}
 */
export type LifeTileProps = {
    /** Which player this is, counted from one */
    number: number;
    /** Their current total */
    life: number;
    /** What the last few taps came to, gone once they have settled */
    delta: number | undefined;
    /** Where they sit and where their tile goes */
    placement: SeatPlacement;
    /** The gradient the tile wears */
    color: string;
    /** Whether the tile butts against its neighbours instead of standing apart */
    flush: boolean;
    /** Adds to the total; repeats while a button is held */
    onChange: (amount: number) => void;
};

/**
 * One player's life total, turned towards their seat.
 *
 * @returns the tile
 */
export function LifeTile({ number, life, delta, placement, color, flush, onChange }: LifeTileProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });

    return (
        <article
            aria-label={player}
            className={clsx(
                "[container-type:size] relative overflow-hidden bg-linear-to-br text-white ring-1 ring-white/15 select-none",
                flush ? "rounded-none" : "rounded-(--radius-card) shadow-(--shadow-card-md)",
                color,
                placement.area,
            )}
        >
            <div className={clsx("[container-type:size] absolute flex items-stretch", FRAME[placement.seat])}>
                <LifeButton
                    amount={-1}
                    label={t("button.change-life", { player, amount: "-1" })}
                    hint={t("label.hold-step", { amount: HOLD_STEP })}
                    onChange={onChange}
                />
                <div className={"flex min-w-0 flex-1 flex-col items-center justify-center gap-[1cqh]"}>
                    <h2
                        className={
                            "max-w-full truncate text-[min(13cqh,5cqw,1.05rem)] font-semibold tracking-wide text-white/80"
                        }
                    >
                        {player}
                    </h2>
                    <strong
                        aria-label={t("label.life", { count: life })}
                        className={"text-[min(60cqh,26cqw,7rem)] leading-none font-black tracking-tight tabular-nums"}
                    >
                        {life}
                    </strong>
                    <span
                        aria-hidden={true}
                        className={clsx(
                            "rounded-full bg-black/25 px-2 text-[min(20cqh,7cqw,0.95rem)] leading-tight font-bold text-white/90 tabular-nums transition-opacity",
                            delta === undefined && "opacity-0",
                        )}
                    >
                        {delta !== undefined && delta > 0 ? "+" : ""}
                        {delta ?? 0}
                    </span>
                </div>
                <LifeButton
                    amount={1}
                    label={t("button.change-life", { player, amount: "+1" })}
                    hint={t("label.hold-step", { amount: HOLD_STEP })}
                    onChange={onChange}
                />
            </div>
        </article>
    );
}

/**
 * The properties for {@link LifeButton}
 */
type LifeButtonProps = {
    /** What a tap is worth */
    amount: -1 | 1;
    /** What the button does, for screen readers */
    label: string;
    /** What holding it does */
    hint: string;
    /** Adds to the total */
    onChange: (amount: number) => void;
};

/**
 * One end of a tile: a tap counts once, a hold keeps counting in tens.
 *
 * Each button keeps its own timers, so two players hitting their tiles at the
 * same time never take each other's press.
 *
 * @returns the button
 */
function LifeButton({ amount, label, hint, onChange }: LifeButtonProps) {
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
            onChange(amount * HOLD_STEP);
            timers.current.interval = window.setInterval(() => onChange(amount * HOLD_STEP), HOLD_INTERVAL);
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
        if (!cancelled && !held) onChange(amount);
    }

    return (
        <button
            type={"button"}
            aria-label={label}
            title={hint}
            onPointerDown={press}
            onPointerUp={() => release(false)}
            onPointerCancel={() => release(true)}
            onContextMenu={(event) => event.preventDefault()}
            className={
                "flex shrink-0 grow-0 basis-[27%] touch-none flex-col items-center justify-center gap-[1cqh] font-light text-white/90 transition hover:bg-white/10 active:bg-white/25"
            }
        >
            <span aria-hidden={true} className={"text-[min(50cqh,13cqw,3.5rem)] leading-none"}>
                {amount > 0 ? "+" : "−"}
            </span>
            <span
                aria-hidden={true}
                className={
                    "hidden text-[min(11cqh,3cqw,0.7rem)] font-semibold tracking-wide text-white/55 @min-[22rem]:block"
                }
            >
                {hint}
            </span>
        </button>
    );
}
