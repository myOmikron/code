import { MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CounterButton } from "src/components/counter-button";

/**
 * How the number rolls: in from the side it is heading away from, out the other way.
 *
 * Written as variants with the direction handed in as `custom`, because a
 * number that is leaving has to roll the way the change goes, not the way the
 * previous change went: `AnimatePresence` passes `custom` to what is exiting.
 */
const ROLL = {
    enter: (direction: number) => ({ y: direction * -20, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (direction: number) => ({ y: direction * 20, opacity: 0 }),
};

/** What holding a life button counts per step */
const HOLD_STEP = 5;

/**
 * The properties for {@link GoldfishLife}
 */
export type GoldfishLifeProps = {
    /** The life total */
    life: number;
    /** Which turn it is */
    turn: number;
    /** How many mulligans were taken */
    mulligans: number;
    /** Books a change to the life total */
    onChange: (amount: number) => void;
    /** Whether the panel is drawn small, for a phone */
    compact?: boolean;
};

/**
 * The player's life, with the turn and the mulligans beside it.
 *
 * @returns the panel
 */
export function GoldfishLife({ life, turn, mulligans, onChange, compact = false }: GoldfishLifeProps) {
    const [t] = useTranslation("goldfish");
    const [previous, setPrevious] = useState(life);
    const [direction, setDirection] = useState<1 | -1>(1);
    if (life !== previous) {
        setDirection(life > previous ? 1 : -1);
        setPrevious(life);
    }

    const hint = t("description.hold-life", { step: HOLD_STEP });
    const button = clsx(
        "flex items-center justify-center rounded-full text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/10",
        compact ? "size-7 *:size-4" : "size-9 *:size-5",
    );

    return (
        <div
            className={clsx(
                "flex items-center rounded-xl bg-zinc-950/5 dark:bg-white/5",
                compact ? "gap-2 px-2 py-1" : "gap-4 px-3 py-2",
            )}
        >
            <div className={"flex items-center gap-2"}>
                <CounterButton
                    amount={-1}
                    hold={-HOLD_STEP}
                    label={t("accessibility.change-life", { amount: "-1" })}
                    title={hint}
                    className={button}
                    onChange={onChange}
                >
                    <MinusIcon />
                </CounterButton>
                <div className={clsx("flex flex-col items-center", compact ? "w-12" : "w-16")}>
                    <span className={"relative block h-7 w-full overflow-hidden text-center"}>
                        <AnimatePresence initial={false} mode={"popLayout"} custom={direction}>
                            <motion.span
                                key={life}
                                custom={direction}
                                variants={ROLL}
                                initial={"enter"}
                                animate={"center"}
                                exit={"exit"}
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                className={clsx(
                                    "absolute inset-x-0 text-2xl/7 font-semibold tabular-nums",
                                    life <= 0 ? "text-red-600 dark:text-red-400" : "text-zinc-950 dark:text-white",
                                )}
                            >
                                {life}
                            </motion.span>
                        </AnimatePresence>
                    </span>
                    <span className={"text-[10px]/3 text-zinc-500 uppercase dark:text-zinc-400"}>
                        {t("label.life")}
                    </span>
                </div>
                <CounterButton
                    amount={1}
                    hold={HOLD_STEP}
                    label={t("accessibility.change-life", { amount: "+1" })}
                    title={hint}
                    className={button}
                    onChange={onChange}
                >
                    <PlusIcon />
                </CounterButton>
            </div>
            <div className={"flex flex-col items-center"}>
                <motion.span
                    key={turn}
                    initial={{ scale: 1.5 }}
                    animate={{ scale: 1 }}
                    className={"text-lg/6 font-semibold text-zinc-950 tabular-nums dark:text-white"}
                >
                    {turn}
                </motion.span>
                <span className={"text-[10px]/3 text-zinc-500 uppercase dark:text-zinc-400"}>{t("label.turn")}</span>
            </div>
            {mulligans > 0 && (
                <div className={"flex flex-col items-center"}>
                    <span className={"text-lg/6 font-semibold text-zinc-950 tabular-nums dark:text-white"}>
                        {mulligans}
                    </span>
                    <span className={"text-[10px]/3 text-zinc-500 uppercase dark:text-zinc-400"}>
                        {t("label.mulligans")}
                    </span>
                </div>
            )}
        </div>
    );
}
