import { XMarkIcon } from "@heroicons/react/20/solid";
import { useTranslation } from "react-i18next";
import { CommanderDamageTarget } from "src/components/commander-damage-target";
import { LifeTotal } from "src/components/life-total";
import { SpindownRing } from "src/components/spindown-ring";
import { REBOOK_LINGER } from "src/utils/life-tracker";

/**
 * The properties for {@link CommanderDamagePanel}
 */
export type CommanderDamagePanelProps = {
    /** Which player is booking, counted from one */
    number: number;
    /** Their current total */
    life: number;
    /** What the last few taps came to, gone once they have settled */
    delta: number | undefined;
    /** What the player's own commander has dealt to them */
    taken: number;
    /** Adjusts damage from their own commander */
    onChange: (amount: number) => void;
    /** Charges the offered hit to their own commander */
    onRebook: () => void;
    /**
     * What the player lost to a hit they have not charged to a commander, when
     * the booking was opened on the back of one
     */
    offer: number | undefined;
    /** Leaves that hit as plain life lost */
    onDismiss: () => void;
};

/**
 * The tile of the player who is booking commander damage.
 *
 * Keeps life in view and allows booking damage from the player's own commander
 * when another player has taken control of it.
 *
 * It wears the same band and shade as the targets, so the whole table reads
 * as being in one mode rather than as three odd tiles and one normal one.
 *
 * A booking opened in the second after a hit lands carries the offer to rebook
 * it: the same damage, charged to a commander instead of to nothing. It is the
 * commonest mistake at a commander table — the swing comes in, the tile gets
 * tapped, and only then does anyone remember whose commander it was — and the
 * only moment it can be corrected without arithmetic is the one right after.
 * While it stands, a tap on an opponent books it instead of counting one, and
 * the spindown shows for how long.
 *
 * @returns the panel
 */
export function CommanderDamagePanel({
    number,
    life,
    delta,
    taken,
    onChange,
    onRebook,
    offer,
    onDismiss,
}: CommanderDamagePanelProps) {
    const [t] = useTranslation("game-utils");
    const player = t("label.player", { number });

    return (
        <div className={"relative flex h-full w-full flex-col items-center"}>
            <span aria-hidden={true} className={"pointer-events-none absolute inset-0 bg-black/20"} />
            <div className={"[container-type:size] relative min-h-0 w-full flex-1"}>
                <CommanderDamageTarget
                    player={number}
                    number={number}
                    taken={taken}
                    offer={offer}
                    onChange={onChange}
                    onRebook={onRebook}
                />
            </div>
            {/* Size the life total to its own strip below the commander controls. */}
            <div
                className={"[container-type:size] relative flex h-[30%] min-h-0 w-full shrink-0 flex-col items-stretch"}
            >
                <LifeTotal name={player} life={life} delta={delta} />
            </div>
            {offer !== undefined && (
                <div
                    role={"group"}
                    aria-label={t("accessibility.rebook-offer", { player, count: offer })}
                    className={
                        "[container-type:size] relative flex h-[22%] max-h-[4rem] min-h-[2rem] w-full shrink-0 items-center justify-center gap-[2cqw] border-t border-white/20 bg-black/45 p-1"
                    }
                >
                    <SpindownRing
                        duration={REBOOK_LINGER}
                        className={"h-full shrink-0 text-[min(40cqh,1.1rem)] font-black tabular-nums"}
                    >
                        {"−"}
                        {offer}
                    </SpindownRing>
                    <span className={"truncate text-[min(40cqh,1rem)] font-semibold text-white/80"}>
                        {t("label.last-hit")}
                    </span>
                    <button
                        type={"button"}
                        aria-label={t("button.dismiss-rebook")}
                        onClick={onDismiss}
                        className={
                            "flex aspect-square h-full shrink-0 items-center justify-center rounded-(--radius-control) text-white/60 transition hover:bg-lime-400/15 active:bg-white/20"
                        }
                    >
                        <XMarkIcon className={"size-[min(56cqh,1.5rem)]"} />
                    </button>
                </div>
            )}
        </div>
    );
}
