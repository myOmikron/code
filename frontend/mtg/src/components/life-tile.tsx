import { HeartIcon, ShieldExclamationIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommanderDamagePanel } from "src/components/commander-damage-panel";
import { CounterButton } from "src/components/counter-button";
import type { LooseHit, Seat, SeatPlacement } from "src/utils/life-tracker";
import {
    COMMANDER_DAMAGE_LETHAL,
    REBOOK_LINGER,
    SEAT_COLORS,
    isEliminated,
    rebookableHit,
} from "src/utils/life-tracker";

/** What a held life button is worth per step */
const HOLD_STEP = 10;

// Type sizes follow the tile (`cqh`/`cqw`) under a `rem` ceiling; tiles at least `22rem` wide
// double that ceiling and give the buttons a smaller share, so a tablet's total can grow.

/**
 * The player's frame, laid over the tile; quarter-turned frames swap their sides in container
 * units so they still cover the tile exactly
 */
const FRAME: Record<Seat, string> = {
    top: "inset-0 rotate-180",
    bottom: "inset-0",
    left: "top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 rotate-90",
    right: "top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 -rotate-90",
};

/** The properties for {@link LifeTile} */
export type LifeTileProps = {
    /** Which player this is, counted from one */
    number: number;
    /** Their name, shown instead of the seat number */
    name?: string;
    /** Their current total */
    life: number;
    /** What the last few taps came to, gone once they have settled */
    delta: number | undefined;
    /** What every seat's commander has put on them, in seat order */
    damage: Array<number>;
    /** The other seats, in turn order after this one */
    opponents: Array<number>;
    /** Where they sit and where their tile goes */
    placement: SeatPlacement;
    /** Whether the tile butts against its neighbours instead of standing apart */
    flush: boolean;
    /** Adds to the total; repeats while a button is held */
    onChange: (amount: number) => void;
    /** Books commander damage from one opponent, which costs the same life */
    onDamage: (opponent: number, amount: number) => void;
    /** The hit no commander has been charged for yet, when rebooking is on */
    hit: LooseHit | undefined;
    /** Charges that hit to one opponent's commander; the life is already gone */
    onRebook: (opponent: number, amount: number) => void;
};

/**
 * One player's life total, turned towards their seat
 *
 * The strip along the near edge shows commander damage as chips in the dealer's colour and opens
 * the tile onto those counters. A solo player gets neither strip nor name.
 *
 * @returns the tile
 */
export function LifeTile({
    number,
    name,
    life,
    delta,
    damage,
    opponents,
    placement,
    flush,
    onChange,
    onDamage,
    hit,
    onRebook,
}: LifeTileProps) {
    const [t] = useTranslation("game-utils");
    const [tracking, setTracking] = useState(false);
    // Snapshotted when the drawer opens, so it holds still while the hit behind it goes stale.
    const [offer, setOffer] = useState<number | undefined>(undefined);
    const expiry = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(expiry.current), []);
    const player = name ?? t("label.player", { number });
    const hint = t("label.hold-step", { amount: HOLD_STEP });
    const out = isEliminated(life, damage);
    const alone = opponents.length === 0;

    /**
     * Takes the offer off the drawer, however it ended
     */
    function dropOffer() {
        window.clearTimeout(expiry.current);
        expiry.current = undefined;
        setOffer(undefined);
    }

    /**
     * Opens or closes the drawer, arming the offer on the way in
     */
    function toggleTracking() {
        dropOffer();
        setTracking(!tracking);
        if (tracking) return;

        const offered = rebookableHit(hit, Date.now());
        if (offered === undefined) return;
        setOffer(offered);
        expiry.current = window.setTimeout(dropOffer, REBOOK_LINGER);
    }

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
                            offer={offer}
                            onChange={(opponent, amount) => {
                                dropOffer();
                                onDamage(opponent, amount);
                            }}
                            onRebook={(opponent) => {
                                if (offer === undefined) return;
                                dropOffer();
                                onRebook(opponent, offer);
                            }}
                            onDismiss={dropOffer}
                        />
                    ) : (
                        <>
                            <LifeStep sign={-1} player={player} hint={hint} onChange={onChange} />
                            <div
                                className={
                                    "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[1cqh] overflow-hidden"
                                }
                            >
                                {!alone && (
                                    <h2
                                        className={
                                            "max-w-full truncate text-[min(11cqh,4cqw,0.95rem)] font-semibold tracking-wide text-white/80 @min-[22rem]:text-[min(11cqh,4cqw,1.9rem)]"
                                        }
                                    >
                                        {player}
                                    </h2>
                                )}
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
                            <LifeStep sign={1} player={player} hint={hint} onChange={onChange} />
                        </>
                    )}
                </div>
                {!alone && (
                    <button
                        type={"button"}
                        aria-label={tracking ? t("button.back-to-life") : t("button.commander-damage", { player })}
                        aria-pressed={tracking}
                        onClick={toggleTracking}
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
                )}
            </div>
        </article>
    );
}

/** The properties for {@link LifeStep} */
type LifeStepProps = {
    /** Whether the button adds or takes life */
    sign: 1 | -1;
    /** The player's name, for the accessible label */
    player: string;
    /** What holding the button does */
    hint: string;
    /** Adds to the total */
    onChange: (amount: number) => void;
};

/**
 * The minus or plus beside a total; holding it steps by {@link HOLD_STEP}
 *
 * @returns the button
 */
function LifeStep({ sign, player, hint, onChange }: LifeStepProps) {
    const [t] = useTranslation("game-utils");

    return (
        <CounterButton
            amount={sign}
            hold={sign * HOLD_STEP}
            label={t("button.change-life", { player, amount: sign < 0 ? "-1" : "+1" })}
            title={hint}
            className={"shrink-0 grow-0 basis-[27%] gap-[1cqh] text-white/90 @min-[22rem]:basis-[23%]"}
            onChange={onChange}
        >
            <span
                aria-hidden={true}
                className={"text-[min(45cqh,13cqw,3.5rem)] leading-none @min-[22rem]:text-[min(45cqh,13cqw,7rem)]"}
            >
                {sign < 0 ? "−" : "+"}
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
    );
}
