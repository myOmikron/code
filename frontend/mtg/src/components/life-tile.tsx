import { BoltIcon, HeartIcon, ShieldExclamationIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CommanderDamagePanel } from "src/components/commander-damage-panel";
import { CommanderDamageTarget } from "src/components/commander-damage-target";
import { CounterButton } from "src/components/counter-button";
import { LifeTotal } from "src/components/life-total";
import type { Seat, SeatPlacement } from "src/utils/life-tracker";
import { COMMANDER_DAMAGE_LETHAL, SEAT_COLORS, SEAT_RINGS, isEliminated } from "src/utils/life-tracker";

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
 * How a tile takes part in the commander damage one player is booking.
 *
 * Booking is a state of the whole table rather than of one tile: the player
 * who took the hit opens it on their own tile, and every opponent's tile turns
 * into the target for that opponent's commander.
 */
export type TileBooking =
    | {
          /** The tile of the player doing the booking */
          role: "booking";
          /** Damage from this player's own commander, including when stolen */
          taken: number;
          onChange: (amount: number) => void;
          onRebook: () => void;
          /**
           * The hit they can charge to a commander with one tap, if the booking
           * was opened right after one
           */
          offer: number | undefined;
          /** Leaves that hit as plain life lost */
          onDismiss: () => void;
      }
    | {
          /** The tile of an opponent, standing for their commander */
          role: "target";
          /** Which player is booking, counted from one */
          player: number;
          /** Where that player reads from, so the tile is turned towards them */
          reader: Seat;
          /** What this commander has put on them */
          taken: number;
          /**
           * The hit a tap charges to this commander instead of counting one, if
           * one stands
           */
          offer: number | undefined;
          /** Books a change against this commander */
          onChange: (amount: number) => void;
          /** Charges the offered hit to this commander */
          onRebook: () => void;
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
    /** What their own commander has put on every seat, in seat order */
    dealt: Array<number>;
    /** The other seats, in turn order after this one */
    opponents: Array<number>;
    /** Where they sit and where their tile goes */
    placement: SeatPlacement;
    /** Whether the tile butts against its neighbours instead of standing apart */
    flush: boolean;
    /** Adds to the total; repeats while a button is held */
    onChange: (amount: number) => void;
    /** What part the tile plays in a booking, while one is open at the table */
    booking: TileBooking | undefined;
    /** Opens booking commander damage for this player, or closes it again */
    onToggleBooking: () => void;
};

/**
 * One player's life total, turned towards their seat.
 *
 * The strip along the near edge carries what the other commanders have put on
 * them and opens the booking: from then on a hit is recorded by tapping the
 * tile of the opponent whose commander dealt it, which is the seat the whole
 * pod is already pointing at.
 *
 * A marker on that strip is a chip in the dealing commander's own colour rather
 * than a number with a dot beside it: the strip is read at arm's length across
 * a table, and a marker that has to be leaned in for is one nobody keeps up to
 * date.
 *
 * The strip also carries the other direction: what this player's own commander
 * has put on everyone else, so they can see how far each opponent is from the
 * lethal helping without asking round the table. Those are outlined in the
 * opponent's colour rather than filled with it — filled means taken, outlined
 * means dealt, and the bolt in front of them says so too.
 *
 * While an opponent is booking, the tile is theirs to tap: it is turned towards
 * them and stands for this player's commander, and its own counter is out of
 * reach until they are done or the table takes it back.
 *
 * A player counting on their own is left with the counter alone: no strip and no
 * name, since neither has anything to point at.
 *
 * @returns the tile
 */
export function LifeTile({
    number,
    life,
    delta,
    damage,
    dealt,
    opponents,
    placement,
    flush,
    onChange,
    booking,
    onToggleBooking,
}: LifeTileProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });
    const hint = t("label.hold-step", { amount: HOLD_STEP });
    const out = isEliminated(life, damage);
    // A player counting on their own has nobody to book commander damage
    // against, so the strip along the near edge would open on nothing. The
    // name goes with it: there is no other tile to tell this one from, and
    // what is left is the total on the whole screen.
    const alone = opponents.length === 0;
    const booked = booking?.role === "booking";
    const commanders = [...opponents, number - 1];
    const dealing = commanders.filter((opponent) => dealt[opponent] > 0);
    // A target is read by the player booking, not by the one it belongs to.
    const seat = booking?.role === "target" ? booking.reader : placement.seat;

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
            <div className={clsx("[container-type:size] absolute flex flex-col", FRAME[seat])}>
                {booking?.role === "target" ? (
                    <CommanderDamageTarget
                        player={booking.player}
                        number={number}
                        taken={booking.taken}
                        offer={booking.offer}
                        onChange={booking.onChange}
                        onRebook={booking.onRebook}
                    />
                ) : (
                    <>
                        <div className={"flex min-h-0 flex-1 items-stretch"}>
                            {booking?.role === "booking" ? (
                                <CommanderDamagePanel
                                    number={number}
                                    life={life}
                                    delta={delta}
                                    offer={booking.offer}
                                    onDismiss={booking.onDismiss}
                                    taken={booking.taken}
                                    onChange={booking.onChange}
                                    onRebook={booking.onRebook}
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
                                    <LifeTotal name={alone ? undefined : player} life={life} delta={delta} />
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
                        {!alone && (
                            <button
                                type={"button"}
                                aria-label={
                                    booked ? t("button.back-to-life") : t("button.commander-damage", { player })
                                }
                                aria-pressed={booked}
                                onClick={onToggleBooking}
                                className={
                                    "flex shrink-0 items-center justify-center gap-[2cqw] bg-black/25 py-[2.5cqh] transition hover:bg-lime-400/25 active:bg-black/50"
                                }
                            >
                                {booked ? (
                                    <HeartIcon
                                        className={
                                            "size-[min(20cqh,5cqw,1.4rem)] @min-[22rem]:size-[min(20cqh,5cqw,2.8rem)]"
                                        }
                                    />
                                ) : (
                                    <ShieldExclamationIcon
                                        className={
                                            "size-[min(20cqh,5cqw,1.4rem)] @min-[22rem]:size-[min(20cqh,5cqw,2.8rem)]"
                                        }
                                    />
                                )}
                                {commanders.map((opponent) =>
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
                                {dealing.length > 0 && (
                                    <>
                                        <BoltIcon
                                            className={
                                                "ml-[2cqw] size-[min(16cqh,4cqw,1.1rem)] text-white/70 @min-[22rem]:size-[min(16cqh,4cqw,2.2rem)]"
                                            }
                                        />
                                        {dealing.map((opponent) => (
                                            <span
                                                key={opponent}
                                                className={clsx(
                                                    "flex items-center rounded-(--radius-pill) px-[2.5cqw] py-[0.5cqh] text-[min(20cqh,6cqw,1.25rem)] leading-tight font-black text-white tabular-nums ring-2 ring-inset @min-[22rem]:text-[min(20cqh,6cqw,2.5rem)]",
                                                    dealt[opponent] >= COMMANDER_DAMAGE_LETHAL
                                                        ? "bg-rose-600/60 ring-rose-300"
                                                        : clsx("bg-black/30", SEAT_RINGS[opponent]),
                                                )}
                                            >
                                                {dealt[opponent]}
                                            </span>
                                        ))}
                                    </>
                                )}
                            </button>
                        )}
                    </>
                )}
            </div>
        </article>
    );
}
