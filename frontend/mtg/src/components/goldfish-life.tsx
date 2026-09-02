import { MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CounterButton } from "src/components/counter-button";

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
    const previous = useRef(life);
    const [direction, setDirection] = useState<1 | -1>(1);

    useEffect(() => {
        if (life !== previous.current) setDirection(life > previous.current ? 1 : -1);
        previous.current = life;
    }, [life]);

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
                        <AnimatePresence initial={false} mode={"popLayout"}>
                            <motion.span
                                key={life}
                                initial={{ y: direction * -20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: direction * 20, opacity: 0 }}
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
