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
    /** Books a change against one opponent's commander */
    onChange: (opponent: number, amount: number) => void;
};

/**
 * What every other commander at the table has put on one player.
 *
 * It takes the place of the life total inside that player's own frame, so the
 * columns read from their seat and stay under the same thumbs.
 *
 * @returns the panel
 */
export function CommanderDamagePanel({ number, damage, onChange }: CommanderDamagePanelProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });

    return (
        <div className={"flex h-full w-full items-stretch"}>
            {damage.map((taken, opponent) => {
                if (opponent === number - 1) return null;
                const name = t("label.player", { number: opponent + 1 });
                const lethal = taken >= COMMANDER_DAMAGE_LETHAL;

                return (
                    <div
                        key={opponent}
                        className={clsx(
                            "[container-type:size] flex min-w-0 flex-1 flex-col items-center justify-center border-l border-white/15 first:border-l-0",
                            lethal && "bg-rose-950/60",
                        )}
                    >
                        <span
                            className={
                                "flex shrink-0 items-center gap-[4cqw] py-[3cqh] text-[min(15cqh,13cqw,0.8rem)] font-semibold text-white/75"
                            }
                        >
                            <span
                                className={clsx(
                                    "size-[min(11cqh,9cqw,0.6rem)] rounded-full bg-linear-to-br",
                                    SEAT_COLORS[opponent],
                                )}
                            />
                            {t("label.player-short", { number: opponent + 1 })}
                        </span>
                        <div className={"flex min-h-0 w-full flex-1 items-stretch"}>
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
