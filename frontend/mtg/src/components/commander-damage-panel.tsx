import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CounterButton } from "src/components/counter-button";
import { COMMANDER_DAMAGE_LETHAL, SEAT_COLORS } from "src/utils/life-tracker";

/**
 * The properties for {@link CommanderDamagePanel}
 */
export type CommanderDamagePanelProps = {
    /** Which player took the damage, counted from one */
    number: number;
    /** What every seat's commander has dealt to them, in seat order */
    damage: Array<number>;
    /** The other seats, in the order they sit in front of this one */
    opponents: Array<number>;
    /** Books a change against one opponent's commander */
    onChange: (opponent: number, amount: number) => void;
};

/**
 * What every other commander at the table has put on one player.
 *
 * It takes the place of the life total inside that player's own frame, so the
 * columns read from their seat and stay under the same thumbs.
 *
 * The columns run left to right the way the opponents themselves sit, seen from
 * this seat, so a hit is booked by looking up rather than by counting seats.
 *
 * Every column is banded and washed in the colour of the commander it counts,
 * because whose damage is being booked is the one thing that must not be got
 * wrong. A dot beside the name cannot carry that on a phone, where five columns
 * share the width of one tile and the dot is a few pixels across.
 *
 * @returns the panel
 */
export function CommanderDamagePanel({ number, damage, opponents, onChange }: CommanderDamagePanelProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });

    return (
        <div className={"flex h-full w-full items-stretch"}>
            {opponents.map((opponent) => {
                const taken = damage[opponent];
                const name = t("label.player", { number: opponent + 1 });
                const lethal = taken >= COMMANDER_DAMAGE_LETHAL;

                return (
                    <div
                        key={opponent}
                        className={clsx(
                            "[container-type:size] relative flex min-w-0 flex-1 flex-col items-center justify-center border-l border-white/15 first:border-l-0",
                            lethal && "bg-rose-950/60",
                        )}
                    >
                        <span
                            aria-hidden={true}
                            className={clsx(
                                "pointer-events-none absolute inset-0 bg-linear-to-b opacity-30",
                                SEAT_COLORS[opponent],
                            )}
                        />
                        <span
                            className={clsx(
                                "relative flex w-full shrink-0 items-center justify-center bg-linear-to-br py-[4cqh] text-[min(17cqh,15cqw,1rem)] font-bold text-white ring-1 ring-white/25 ring-inset",
                                SEAT_COLORS[opponent],
                            )}
                        >
                            {t("label.player-short", { number: opponent + 1 })}
                        </span>
                        <div className={"relative flex min-h-0 w-full flex-1 items-stretch"}>
                            <CounterButton
                                amount={-1}
                                hold={-1}
                                label={t("button.change-commander-damage", { player, opponent: name, amount: "-1" })}
                                className={"shrink-0 grow-0 basis-[28%] text-[min(35cqh,22cqw,1.75rem)] text-white/80"}
                                onChange={(amount) => onChange(opponent, amount)}
                            >
                                <span aria-hidden={true}>{"−"}</span>
                            </CounterButton>
                            <span
                                aria-label={t("accessibility.commander-damage-taken", {
                                    player,
                                    opponent: name,
                                    count: taken,
                                })}
                                className={
                                    "flex min-w-0 flex-1 items-center justify-center text-[min(45cqh,30cqw,3rem)] leading-none font-black tabular-nums"
                                }
                            >
                                {taken}
                            </span>
                            <CounterButton
                                amount={1}
                                hold={1}
                                label={t("button.change-commander-damage", { player, opponent: name, amount: "+1" })}
                                className={"shrink-0 grow-0 basis-[28%] text-[min(35cqh,22cqw,1.75rem)] text-white/80"}
                                onChange={(amount) => onChange(opponent, amount)}
                            >
                                <span aria-hidden={true}>{"+"}</span>
                            </CounterButton>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
