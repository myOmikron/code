import { SparklesIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { RolledTheme } from "src/api/graph-generated";
import { PrimaryButton } from "src/components/primary-button";
import { levelKey } from "src/utils/dating-date";

/** Where a Blind Date stands */
export type BlindState =
    { kind: "waiting" } | { kind: "revealed"; themes: Array<RolledTheme>; added: number } | { kind: "failed" };

/**
 * The properties for {@link DatingBlindView}
 */
export type DatingBlindViewProps = {
    /** The Commander's name */
    name: string;
    /** Art crop url */
    art: string | null;
    /** Where the date stands */
    state: BlindState;
    /** Go on to card swiping */
    onSwipe: () => void;
    /** Fill the open slots without swiping */
    onSurprise: () => void;
    /** The open slots are being filled */
    surprising: boolean;
    /** Open the deck as it is */
    onBuild: () => void;
};

/** Card backs fanned while the date gets ready */
const FAN = [-18, -6, 6, 18];

/**
 * A Blind Date: a shuffling wait, then the reveal of what was rolled.
 *
 * @returns the full-screen view
 */
export function DatingBlindView({ name, art, state, onSwipe, onSurprise, surprising, onBuild }: DatingBlindViewProps) {
    const [t] = useTranslation("dating");

    return (
        <div
            className={
                "fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-zinc-950 px-8 text-center text-white"
            }
        >
            {state.kind === "waiting" && (
                <>
                    <div className={"relative h-40 w-32"} aria-hidden={true}>
                        {FAN.map((angle, index) => (
                            <motion.span
                                key={angle}
                                className={
                                    "absolute inset-0 rounded-xl border-2 border-lime-400/60 bg-linear-to-br from-zinc-800 to-zinc-900"
                                }
                                animate={{ rotate: [0, angle, 0], y: [0, -10, 0] }}
                                transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.15 }}
                            />
                        ))}
                    </div>
                    <h2 className={"text-2xl font-extrabold"}>{t("heading.blind-waiting")}</h2>
                </>
            )}

            {state.kind === "revealed" && (
                <motion.div
                    className={"flex w-full max-w-sm flex-col items-center gap-5"}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 20 }}
                >
                    <span className={"size-28 overflow-hidden rounded-full border-4 border-lime-400 bg-zinc-800"}>
                        {art !== null && (
                            <img
                                src={art}
                                alt={t("accessibility.art", { name })}
                                crossOrigin={"anonymous"}
                                className={"size-full object-cover object-[center_35%]"}
                            />
                        )}
                    </span>
                    <h2 className={"text-3xl font-extrabold text-lime-400"}>{t("heading.blind-reveal", { name })}</h2>
                    <ul className={"flex w-full flex-col gap-1.5"}>
                        {state.themes.map((theme) => (
                            <li
                                key={theme.theme}
                                className={
                                    "flex items-center justify-between rounded-(--radius-control) bg-zinc-900 px-3.5 py-2.5"
                                }
                            >
                                <span className={"font-semibold"}>{theme.label}</span>
                                <span
                                    className={clsx(
                                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                                        theme.level === "allin"
                                            ? "bg-lime-400 text-lime-950"
                                            : "bg-zinc-800 text-zinc-200",
                                    )}
                                >
                                    {t(levelKey(theme.level))}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className={"text-zinc-300"}>{t("description.blind-added", { count: state.added })}</p>
                    <div className={"flex w-full flex-col gap-2"}>
                        <PrimaryButton className={"w-full"} disabled={surprising} onClick={onSwipe}>
                            {t("button.swipe-rest")}
                        </PrimaryButton>
                        <Button
                            plain={true}
                            className={"w-full text-white!"}
                            disabled={surprising}
                            onClick={onSurprise}
                        >
                            <SparklesIcon className={"fill-lime-400!"} />
                            {t("button.surprise-me")}
                        </Button>
                    </div>
                </motion.div>
            )}

            {state.kind === "failed" && (
                <>
                    <p className={"max-w-xs text-lg"}>{t("description.blind-failed")}</p>
                    <Button plain={true} className={"text-white!"} onClick={onBuild}>
                        {t("button.build-anyway")}
                    </Button>
                </>
            )}
        </div>
    );
}
