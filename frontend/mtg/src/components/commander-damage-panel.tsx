import { XMarkIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CounterButton } from "src/components/counter-button";
import { SpindownRing } from "src/components/spindown-ring";
import { COMMANDER_DAMAGE_LETHAL, REBOOK_LINGER, SEAT_COLORS } from "src/utils/life-tracker";

/**
 * The properties for {@link CommanderDamagePanel}
 */
export type CommanderDamagePanelProps = {
    /** Which player took the damage, counted from one */
    number: number;
    /** What every seat's commander has dealt to them, in seat order */
    damage: Array<number>;
    /** The other seats, in turn order after this one */
    opponents: Array<number>;
    /** Books a change against one opponent's commander */
    onChange: (opponent: number, amount: number) => void;
    /**
     * What the player lost to a hit they have not charged to a commander, when
     * the drawer was opened on the back of one
     */
    offer: number | undefined;
    /** Charges that hit to one opponent's commander, without costing life twice */
    onRebook: (opponent: number) => void;
    /** Leaves the hit as plain life lost */
    onDismiss: () => void;
};

/**
 * What every other commander at the table has put on one player.
 *
 * It takes the place of the life total inside that player's own frame, so the
 * columns read from their seat and stay under the same thumbs.
 *
 * The columns run in turn order from this seat: the player on the left first,
 * then the rest of the table clockwise behind them. That is the order a pod
 * says out loud, so a hit is booked by naming a seat rather than by hunting for
 * one.
 *
 * Every column is painted in the colour of the commander it counts, over a
 * ground that hides the tile's own, because whose damage is being booked is the
 * one thing that must not be got wrong. A dot beside the name cannot carry that
 * on a phone, where five columns share the width of one tile and the dot is a
 * few pixels across; neither could the wash this replaces, which left a green
 * commander's column reading blue inside a blue player's tile.
 *
 * The two counters are stacked rather than set either side of the total: a
 * column is as narrow as a fifth of a tile, and a button that only has a share
 * of that width is a few millimetres across. Stacked, each one keeps the whole
 * width of its column and takes half of what is left of its height, which is a
 * thumb's worth at every pod size. Up counts up, the total sits between them.
 *
 * A drawer opened in the second after a hit lands carries the offer to rebook
 * it: the same damage, charged to a commander instead of to nothing. It is the
 * commonest mistake at a commander table — the swing comes in, the tile gets
 * tapped, and only then does anyone remember whose commander it was — and the
 * only moment it can be corrected without arithmetic is the one right after.
 *
 * @returns the panel
 */
export function CommanderDamagePanel({
    number,
    damage,
    opponents,
    onChange,
    offer,
    onRebook,
    onDismiss,
}: CommanderDamagePanelProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });

    return (
        <div className={"flex h-full w-full flex-col items-stretch"}>
            <div className={"flex min-h-0 w-full flex-1 items-stretch"}>
                {opponents.map((opponent) => {
                    const taken = damage[opponent];
                    const name = t("label.player", { number: opponent + 1 });
                    const lethal = taken >= COMMANDER_DAMAGE_LETHAL;

                    return (
                        <div
                            key={opponent}
                            className={
                                "[container-type:size] relative flex min-w-0 flex-1 flex-col items-center justify-center border-l border-white/15 bg-zinc-950 first:border-l-0"
                            }
                        >
                            <span
                                aria-hidden={true}
                                className={clsx(
                                    "pointer-events-none absolute inset-0 bg-linear-to-b",
                                    SEAT_COLORS[opponent],
                                )}
                            />
                            <span
                                className={
                                    "relative flex w-full shrink-0 items-center justify-center bg-black/30 py-[4cqh] text-[min(17cqh,15cqw,1.5rem)] font-bold text-white ring-1 ring-white/25 ring-inset"
                                }
                            >
                                {t("label.player-short", { number: opponent + 1 })}
                            </span>
                            <div className={"relative flex min-h-0 w-full flex-1 flex-col items-stretch"}>
                                <CounterButton
                                    amount={1}
                                    hold={1}
                                    label={t("button.change-commander-damage", {
                                        player,
                                        opponent: name,
                                        amount: "+1",
                                    })}
                                    className={"min-h-0 flex-1 basis-0 text-[min(28cqh,34cqw,3.5rem)] text-white/85"}
                                    onChange={(amount) => onChange(opponent, amount)}
                                >
                                    <span aria-hidden={true}>{"+"}</span>
                                </CounterButton>
                                <span
                                    aria-label={t("accessibility.commander-damage-taken", {
                                        player,
                                        opponent: name,
                                        count: taken,
                                    })}
                                    className={
                                        "flex w-full shrink-0 items-center justify-center border-y border-white/20 py-[1cqh] text-[min(26cqh,42cqw,4.5rem)] leading-none font-black tabular-nums"
                                    }
                                >
                                    {taken}
                                </span>
                                <CounterButton
                                    amount={-1}
                                    hold={-1}
                                    label={t("button.change-commander-damage", {
                                        player,
                                        opponent: name,
                                        amount: "-1",
                                    })}
                                    className={"min-h-0 flex-1 basis-0 text-[min(28cqh,34cqw,3.5rem)] text-white/85"}
                                    onChange={(amount) => onChange(opponent, amount)}
                                >
                                    <span aria-hidden={true}>{"\u2212"}</span>
                                </CounterButton>
                            </div>
                            {lethal && (
                                <span
                                    aria-hidden={true}
                                    className={
                                        "pointer-events-none absolute inset-0 bg-rose-600/25 ring-2 ring-rose-300 ring-inset"
                                    }
                                />
                            )}
                        </div>
                    );
                })}
            </div>
            {offer !== undefined && (
                <div
                    role={"group"}
                    aria-label={t("accessibility.rebook-offer", { player, count: offer })}
                    className={
                        "flex h-[30%] max-h-[4rem] min-h-[2rem] w-full shrink-0 items-stretch gap-1 border-t border-white/20 bg-black/45 p-1"
                    }
                >
                    {/* Centred rather than spread: a duel has one opponent, and
                        a single chip stretched across the width of a tile
                        reads as a banner rather than as something to hit. */}
                    <div className={"[container-type:size] flex min-w-0 flex-1 items-stretch justify-center gap-1"}>
                        <SpindownRing
                            duration={REBOOK_LINGER}
                            className={"h-full shrink-0 text-[min(40cqh,1.1rem)] font-black tabular-nums"}
                        >
                            {"−"}
                            {offer}
                        </SpindownRing>
                        {opponents.map((opponent) => (
                            <button
                                key={opponent}
                                type={"button"}
                                aria-label={t("button.rebook-commander-damage", {
                                    player,
                                    opponent: t("label.player", { number: opponent + 1 }),
                                    count: offer,
                                })}
                                onClick={() => onRebook(opponent)}
                                className={clsx(
                                    "flex max-w-40 min-w-0 flex-1 items-center justify-center rounded-(--radius-control) bg-linear-to-br text-[min(46cqh,1.3rem)] font-black text-white ring-1 ring-white/40 transition active:brightness-125",
                                    SEAT_COLORS[opponent],
                                )}
                            >
                                {t("label.player-short", { number: opponent + 1 })}
                            </button>
                        ))}
                        <button
                            type={"button"}
                            aria-label={t("button.dismiss-rebook")}
                            onClick={onDismiss}
                            className={
                                "flex aspect-square h-full shrink-0 items-center justify-center rounded-(--radius-control) text-white/60 transition hover:bg-white/10 active:bg-white/20"
                            }
                        >
                            <XMarkIcon className={"size-[min(56cqh,1.5rem)]"} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
