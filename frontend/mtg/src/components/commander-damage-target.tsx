import { ShieldExclamationIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { CounterButton } from "src/components/counter-button";
import { SpindownRing } from "src/components/spindown-ring";
import { COMMANDER_DAMAGE_LETHAL, REBOOK_LINGER } from "src/utils/life-tracker";

/**
 * The properties for {@link CommanderDamageTarget}
 */
export type CommanderDamageTargetProps = {
    /** Which player is booking, counted from one */
    player: number;
    /** Whose commander this tile stands for, counted from one */
    number: number;
    /** What that commander has put on the booking player */
    taken: number;
    /**
     * The hit the booking player took that a tap here charges to this
     * commander instead of counting one, if the booking was opened right after
     * one
     */
    offer: number | undefined;
    /** Books a change against this commander */
    onChange: (amount: number) => void;
    /** Charges the offered hit to this commander, without costing life twice */
    onRebook: () => void;
};

/**
 * An opponent's tile while another player is booking commander damage.
 *
 * It stands for that opponent's commander: the tile is already painted in
 * their colour and sits where they sit, so the player who took the hit points
 * at the seat it came from, the way a pod says it out loud, instead of finding
 * that seat in a list on their own tile.
 *
 * It is turned towards the player booking rather than the one it belongs to,
 * since they are the one reading and reaching for it, and it is laid out like
 * the life tile they just came from: minus at one end, the tally in the
 * middle, plus at the other, both ends the same width so the tally stays in
 * the middle of the tile. The plus is still the heavier of the two — a bigger
 * glyph on a lit ground — because a hit is booked far more often than it is
 * taken back.
 *
 * Everything that says "this is not the tile it was a moment ago" is on top:
 * a band naming what is being booked, a shade over the colour, and a ring
 * that breathes. A table looks at four tiles that all look alike, and the one
 * thing that must not happen is someone counting life on a tile that is
 * booking damage.
 *
 * Carrying an offer, the plus books the offered hit in one tap and the ring
 * around it shows how long that stands.
 *
 * @returns the target
 */
export function CommanderDamageTarget({
    player,
    number,
    taken,
    offer,
    onChange,
    onRebook,
}: CommanderDamageTargetProps) {
    const [t] = useTranslation("game-utils");
    const reader = t("label.player", { number: player });
    const name = t("label.player", { number });
    const lethal = taken >= COMMANDER_DAMAGE_LETHAL;

    return (
        <div className={"relative flex h-full w-full flex-col"}>
            <span aria-hidden={true} className={"pointer-events-none absolute inset-0 bg-black/20"} />
            <div
                className={
                    "relative flex shrink-0 items-center justify-center gap-[1.5cqw] bg-black/40 px-[3cqw] py-[2cqh] text-white/90"
                }
            >
                <ShieldExclamationIcon
                    className={"size-[min(14cqh,4cqw,1.1rem)] shrink-0 @min-[22rem]:size-[min(14cqh,4cqw,2.2rem)]"}
                />
                <span
                    className={
                        "truncate text-[min(9cqh,3.2cqw,0.75rem)] font-bold tracking-wider uppercase @min-[22rem]:text-[min(9cqh,3.2cqw,1.5rem)]"
                    }
                >
                    {t("label.commander-damage-to", { player: reader })}
                </span>
            </div>
            <div className={"relative flex min-h-0 flex-1 items-stretch"}>
                <CounterButton
                    amount={-1}
                    hold={-1}
                    label={t("button.change-commander-damage", { player: reader, opponent: name, amount: "-1" })}
                    className={"shrink-0 grow-0 basis-[27%] text-white/90 @min-[22rem]:basis-[23%]"}
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
                </CounterButton>
                <div
                    className={
                        "pointer-events-none relative z-10 flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[1cqh] overflow-hidden"
                    }
                >
                    <span
                        aria-hidden={true}
                        className={
                            "max-w-full truncate text-[min(11cqh,4cqw,0.95rem)] font-semibold tracking-wide text-white/80 @min-[22rem]:text-[min(11cqh,4cqw,1.9rem)]"
                        }
                    >
                        {name}
                    </span>
                    <strong
                        aria-label={t("accessibility.commander-damage-taken", {
                            player: reader,
                            opponent: name,
                            count: taken,
                        })}
                        className={
                            "text-[min(46cqh,24cqw,6rem)] leading-none font-black tracking-tight tabular-nums @min-[22rem]:text-[min(46cqh,28cqw,12rem)]"
                        }
                    >
                        {taken}
                    </strong>
                </div>
                {offer === undefined ? (
                    <CounterButton
                        amount={1}
                        hold={1}
                        label={t("button.change-commander-damage", { player: reader, opponent: name, amount: "+1" })}
                        className={"absolute inset-y-0 right-0 left-[27%] items-end text-white @min-[22rem]:left-[23%]"}
                        onChange={onChange}
                    >
                        <span
                            aria-hidden={true}
                            className={
                                "flex h-full w-[36.9863%] items-center justify-center bg-white/15 text-[min(56cqh,17cqw,4.5rem)] leading-none @min-[22rem]:w-[29.8701%] @min-[22rem]:text-[min(56cqh,17cqw,9rem)]"
                            }
                        >
                            {"+"}
                        </span>
                    </CounterButton>
                ) : (
                    <button
                        type={"button"}
                        aria-label={t("button.rebook-commander-damage", {
                            player: reader,
                            opponent: name,
                            count: offer,
                        })}
                        onClick={onRebook}
                        className={
                            "absolute inset-y-0 right-0 left-[27%] flex items-stretch justify-end transition hover:bg-lime-400/15 active:bg-white/25 @min-[22rem]:left-[23%]"
                        }
                    >
                        <span
                            className={
                                "flex w-[36.9863%] items-center justify-center bg-white/15 @min-[22rem]:w-[29.8701%]"
                            }
                        >
                            <SpindownRing
                                duration={REBOOK_LINGER}
                                className={
                                    "h-[min(48cqh,22cqw,4.5rem)] text-[min(20cqh,9cqw,1.8rem)] font-black tabular-nums @min-[22rem]:h-[min(48cqh,22cqw,9rem)] @min-[22rem]:text-[min(20cqh,9cqw,3.6rem)]"
                                }
                            >
                                {"+"}
                                {offer}
                            </SpindownRing>
                        </span>
                    </button>
                )}
                <span
                    aria-hidden={true}
                    className={"pointer-events-none shrink-0 basis-[27%] @min-[22rem]:basis-[23%]"}
                />
            </div>
            {/* Two rings on top of everything: one that breathes to mark the
                tile as a target rather than the tile it was a moment ago, and
                a red one once this commander alone has done for the player. */}
            <span
                aria-hidden={true}
                className={"pointer-events-none absolute inset-0 animate-pulse ring-4 ring-white/70 ring-inset"}
            />
            {lethal && (
                <span
                    aria-hidden={true}
                    className={"pointer-events-none absolute inset-0 bg-rose-600/25 ring-4 ring-rose-300 ring-inset"}
                />
            )}
        </div>
    );
}
