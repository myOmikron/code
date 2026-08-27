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

// Why every size below carries two ceilings, `@min-[22rem]` being the second:
//
// A tile sizes its type off its own box (`cqh`/`cqw`), which is what keeps a
// total inside a tile a phone splits four ways. The `rem` term in each `min()`
// is the ceiling on top of that, and on a phone it never comes into play — a
// quarter of a 200px tile is small enough on its own.
//
// On a tablet it was the only thing that did: a 530px tile has room for a
// ~130px total, and the ceiling held it at 96px. From the tile width where that
// stops making sense, the whole scale therefore doubles its ceiling and the
// geometry decides again. Nothing overflows for it — the `cqh`/`cqw` terms are
// unchanged, and on anything smaller they are still the ones that bind.
//
// The threshold is the tile's own reading width, not the window's: a pod of six
// on a tablet gets narrow tiles and keeps the tighter scale, and a duel on a
// phone in landscape gets a wide one and is welcome to the looser.
//
// With the ceiling out of the way it is the width term that holds the total, and
// what sets it is the room between the two buttons: three digits have to fit
// there, which is what makes it a share of the tile rather than a size. The
// buttons therefore give up four points of that share on a tile this wide —
// where 23% is still a thumb's worth — and the total takes the width.

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
    /** The other seats, in the order they sit in front of this one */
    opponents: Array<number>;
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
 * A marker on that strip is a chip in the dealing commander's own colour rather
 * than a number with a dot beside it: the strip is read at arm's length across
 * a table, and a marker that has to be leaned in for is one nobody keeps up to
 * date.
 *
 * @returns the tile
 */
export function LifeTile({
    number,
    life,
    delta,
    damage,
    opponents,
    placement,
    flush,
    onChange,
    onDamage,
}: LifeTileProps) {
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
                        <CommanderDamagePanel
                            number={number}
                            damage={damage}
                            opponents={opponents}
                            onChange={onDamage}
                        />
                    ) : (
                        <>
                            <CounterButton
                                amount={-1}
                                hold={-HOLD_STEP}
                                label={t("button.change-life", { player, amount: "-1" })}
                                title={hint}
                                className={
                                    "shrink-0 grow-0 basis-[27%] gap-[1cqh] text-white/90 @min-[22rem]:basis-[23%]"
                                }
                                onChange={onChange}
                            >
                                <span
                                    aria-hidden={true}
                                    className={
                                        "text-[min(45cqh,13cqw,3.5rem)] leading-none @min-[22rem]:text-[min(45cqh,13cqw,7rem)]"
                                    }
                                >
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
                                        "max-w-full truncate text-[min(11cqh,4cqw,0.95rem)] font-semibold tracking-wide text-white/80 @min-[22rem]:text-[min(11cqh,4cqw,1.9rem)]"
                                    }
                                >
                                    {player}
                                </h2>
                                <strong
                                    aria-label={t("label.life", { count: life })}
                                    className={
                                        "text-[min(46cqh,24cqw,6rem)] leading-none font-black tracking-tight tabular-nums @min-[22rem]:text-[min(46cqh,28cqw,12rem)]"
                                    }
                                >
                                    {life}
                                </strong>
                                <span
                                    aria-hidden={true}
                                    className={clsx(
                                        "rounded-(--radius-pill) bg-black/25 px-[2cqw] text-[min(14cqh,5cqw,0.85rem)] leading-tight font-bold text-white/90 tabular-nums transition-opacity @min-[22rem]:text-[min(14cqh,5cqw,1.7rem)]",
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
                                className={
                                    "shrink-0 grow-0 basis-[27%] gap-[1cqh] text-white/90 @min-[22rem]:basis-[23%]"
                                }
                                onChange={onChange}
                            >
                                <span
                                    aria-hidden={true}
                                    className={
                                        "text-[min(45cqh,13cqw,3.5rem)] leading-none @min-[22rem]:text-[min(45cqh,13cqw,7rem)]"
                                    }
                                >
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
                        "flex shrink-0 items-center justify-center gap-[2cqw] bg-black/25 py-[2.5cqh] transition hover:bg-black/40 active:bg-black/50"
                    }
                >
                    {tracking ? (
                        <HeartIcon
                            className={"size-[min(20cqh,5cqw,1.4rem)] @min-[22rem]:size-[min(20cqh,5cqw,2.8rem)]"}
                        />
                    ) : (
                        <ShieldExclamationIcon
                            className={"size-[min(20cqh,5cqw,1.4rem)] @min-[22rem]:size-[min(20cqh,5cqw,2.8rem)]"}
                        />
                    )}
                    {!tracking &&
                        opponents.map((opponent) =>
                            damage[opponent] === 0 ? null : (
                                <span
                                    key={opponent}
                                    className={clsx(
                                        "flex items-center rounded-(--radius-pill) bg-linear-to-br px-[2.5cqw] py-[0.5cqh] text-[min(20cqh,6cqw,1.25rem)] leading-tight font-black text-white tabular-nums @min-[22rem]:text-[min(20cqh,6cqw,2.5rem)]",
                                        SEAT_COLORS[opponent],
                                        damage[opponent] >= COMMANDER_DAMAGE_LETHAL
                                            ? "ring-2 ring-rose-300"
                                            : "ring-1 ring-white/30",
                                    )}
                                >
                                    {damage[opponent]}
                                </span>
                            ),
                        )}
                </button>
            </div>
        </article>
    );
}
