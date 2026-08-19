import { HeartIcon, ShieldExclamationIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CommanderDamagePanel } from "src/components/commander-damage-panel";
import { CounterButton } from "src/components/counter-button";
import type { Seat, SeatPlacement } from "src/utils/life-tracker";
import { COMMANDER_DAMAGE_LETHAL, SEAT_COLORS, isEliminated } from "src/utils/life-tracker";

/** What a held life button is worth per step */
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
    /** What every seat's commander has put on them, in seat order */
    damage: Array<number>;
    /** Where they sit and where their tile goes */
    placement: SeatPlacement;
    /** Whether the tile butts against its neighbours instead of standing apart */
    flush: boolean;
    /** Adds to the total; repeats while a button is held */
    onChange: (amount: number) => void;
    /** Books commander damage from one opponent, which costs the same life */
    onDamage: (opponent: number, amount: number) => void;
};

/**
 * One player's life total, turned towards their seat.
 *
 * The strip along the near edge carries what the other commanders have put on
 * them and opens the same tile onto those counters, so a player never reaches
 * across the table to record a hit.
 *
 * @returns the tile
 */
export function LifeTile({ number, life, delta, damage, placement, flush, onChange, onDamage }: LifeTileProps) {
    const [t] = useTranslation("game-utils");
    const [tracking, setTracking] = useState(false);
    const player = t("label.player", { number });
    const hint = t("label.hold-step", { amount: HOLD_STEP });
    const out = isEliminated(life, damage);

    return (
        <article
            aria-label={player}
            className={clsx(
                "[container-type:size] relative overflow-hidden bg-linear-to-br text-white ring-1 ring-white/15 select-none",
                flush ? "rounded-none" : "rounded-(--radius-card) shadow-(--shadow-card-md)",
                out ? "from-zinc-500 to-zinc-800 text-white/75" : SEAT_COLORS[number - 1],
                placement.area,
            )}
        >
            <div className={clsx("[container-type:size] absolute flex flex-col", FRAME[placement.seat])}>
                <div className={"flex min-h-0 flex-1 items-stretch"}>
                    {tracking ? (
                        <CommanderDamagePanel number={number} damage={damage} onChange={onDamage} />
                    ) : (
                        <>
                            <CounterButton
                                amount={-1}
                                hold={-HOLD_STEP}
                                label={t("button.change-life", { player, amount: "-1" })}
                                title={hint}
                                className={"shrink-0 grow-0 basis-[27%] gap-[1cqh] text-white/90"}
                                onChange={onChange}
                            >
                                <span aria-hidden={true} className={"text-[min(45cqh,13cqw,3.5rem)] leading-none"}>
                                    {"−"}
                                </span>
                                <span
                                    aria-hidden={true}
                                    className={
                                        "hidden text-[min(10cqh,3cqw,0.7rem)] font-semibold tracking-wide text-white/55 @min-[22rem]:block"
                                    }
                                >
                                    {hint}
                                </span>
                            </CounterButton>
                            <div
                                className={
                                    "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[1cqh] overflow-hidden"
                                }
                            >
                                <h2
                                    className={
                                        "max-w-full truncate text-[min(11cqh,4cqw,0.95rem)] font-semibold tracking-wide text-white/80"
                                    }
                                >
                                    {player}
                                </h2>
                                <strong
                                    aria-label={t("label.life", { count: life })}
                                    className={
                                        "text-[min(46cqh,24cqw,6rem)] leading-none font-black tracking-tight tabular-nums"
                                    }
                                >
                                    {life}
                                </strong>
                                <span
                                    aria-hidden={true}
                                    className={clsx(
                                        "rounded-(--radius-pill) bg-black/25 px-[2cqw] text-[min(14cqh,5cqw,0.85rem)] leading-tight font-bold text-white/90 tabular-nums transition-opacity",
                                        delta === undefined && "opacity-0",
                                    )}
                                >
                                    {delta !== undefined && delta > 0 ? "+" : ""}
                                    {delta ?? 0}
                                </span>
                            </div>
                            <CounterButton
                                amount={1}
                                hold={HOLD_STEP}
                                label={t("button.change-life", { player, amount: "+1" })}
                                title={hint}
                                className={"shrink-0 grow-0 basis-[27%] gap-[1cqh] text-white/90"}
                                onChange={onChange}
                            >
                                <span aria-hidden={true} className={"text-[min(45cqh,13cqw,3.5rem)] leading-none"}>
                                    {"+"}
                                </span>
                                <span
                                    aria-hidden={true}
                                    className={
                                        "hidden text-[min(10cqh,3cqw,0.7rem)] font-semibold tracking-wide text-white/55 @min-[22rem]:block"
                                    }
                                >
                                    {hint}
                                </span>
                            </CounterButton>
                        </>
                    )}
                </div>
                <button
                    type={"button"}
                    aria-label={tracking ? t("button.back-to-life") : t("button.commander-damage", { player })}
                    aria-pressed={tracking}
                    onClick={() => setTracking((current) => !current)}
                    className={
                        "flex shrink-0 items-center justify-center gap-[2cqw] bg-black/25 py-[2cqh] transition hover:bg-black/40 active:bg-black/50"
                    }
                >
                    {tracking ? (
                        <HeartIcon className={"size-[min(15cqh,4cqw,1.1rem)]"} />
                    ) : (
                        <ShieldExclamationIcon className={"size-[min(15cqh,4cqw,1.1rem)]"} />
                    )}
                    {!tracking &&
                        damage.map((taken, opponent) =>
                            opponent === number - 1 || taken === 0 ? null : (
                                <span
                                    key={opponent}
                                    className={clsx(
                                        "flex items-center gap-[1cqw] rounded-(--radius-pill) px-[1cqw] text-[min(12cqh,3cqw,0.75rem)] font-bold tabular-nums",
                                        taken >= COMMANDER_DAMAGE_LETHAL && "bg-rose-600",
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            "size-[min(8cqh,2cqw,0.5rem)] rounded-full bg-linear-to-br",
                                            SEAT_COLORS[opponent],
                                        )}
                                    />
                                    {taken}
                                </span>
                            ),
                        )}
                </button>
            </div>
        </article>
    );
}
