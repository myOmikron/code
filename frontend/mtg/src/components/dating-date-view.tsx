import { ChevronLeftIcon, HeartIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DateProgress, ThemeLevel } from "src/api/generated";
import type { DateSessionResponse, DateThemeResponse } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { dateMessages, levelKey } from "src/utils/dating-date";

/** What the player can answer a proposal with, best first */
const ANSWERS: Array<ThemeLevel> = [ThemeLevel.allin, ThemeLevel.core, ThemeLevel.light, ThemeLevel.avoid];

/** What the player can bring a theme at */
const BRINGS: Array<ThemeLevel> = [ThemeLevel.light, ThemeLevel.core, ThemeLevel.allin];

/** A tappable answer */
const CHOICE =
    "min-h-11 rounded-(--radius-control) px-3 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 disabled:opacity-50";

/** A choice that is not picked */
const QUIET = "bg-white text-zinc-900 ring-zinc-950/10 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10";

/**
 * The properties for {@link DatingDateView}
 */
export type DatingDateViewProps = {
    /** The date */
    session: DateSessionResponse;
    /** Whether a move is being sent */
    busy: boolean;
    /** Answer the Commander's proposal */
    onAnswer: (level: ThemeLevel) => void;
    /** Bring a theme from the palette */
    onBring: (theme: string, level: ThemeLevel) => Promise<void>;
    /** "That's all, date night" */
    onDateNight: () => void;
    /** "No, come back" after the Commander left */
    onComeBack: () => void;
    /** Go on to card swiping */
    onMeetCards: () => void;
    /** Leave the date for the deck */
    onBuildAnyway: () => void;
    /** Leave for the matches, to come back later */
    onBack: () => void;
    /** What the Commander says when it leaves, if it has a line for that */
    leftLine?: string | null;
};

/**
 * A date as a chat: the Commander's proposals and reactions, the player's answers,
 * the chemistry meter, and how it ended.
 *
 * @returns the date
 */
export function DatingDateView(props: DatingDateViewProps) {
    const { session, busy, onAnswer, onBring, onDateNight, onComeBack, onMeetCards, onBuildAnyway, onBack, leftLine } =
        props;
    const [t] = useTranslation("dating");
    const [mine, setMine] = useState<DateThemeResponse | null>(null);

    const messages = dateMessages(session);
    const meter = session.chemistry >= 60 ? "bg-lime-500" : session.chemistry >= 30 ? "bg-amber-500" : "bg-red-500";
    const meterText =
        session.chemistry >= 60
            ? "text-lime-600 dark:text-lime-400"
            : session.chemistry >= 30
              ? "text-amber-600 dark:text-amber-400"
              : "text-red-600 dark:text-red-400";
    const answering = session.next === "Commander" && session.proposal != null;
    const picking = session.next === "Player";

    return (
        <>
            <div className={"mx-auto flex h-[calc(100dvh-5rem)] min-h-[34rem] w-full max-w-md flex-col"}>
                <header className={"flex items-center gap-3 border-b border-zinc-950/5 px-2 py-2 dark:border-white/5"}>
                    <Button plain={true} onClick={onBack} aria-label={t("accessibility.back")}>
                        <ChevronLeftIcon />
                    </Button>
                    <span
                        className={
                            "size-10 shrink-0 overflow-hidden rounded-full bg-zinc-200 ring-2 ring-lime-500 dark:bg-zinc-800"
                        }
                    >
                        {session.image_art_crop && (
                            <img
                                src={session.image_art_crop}
                                alt={t("accessibility.art", { name: session.name })}
                                crossOrigin={"anonymous"}
                                className={"size-full object-cover object-[center_35%]"}
                            />
                        )}
                    </span>
                    <div className={"min-w-0 flex-1"}>
                        <p className={"truncate font-bold text-zinc-950 dark:text-white"}>{session.name}</p>
                        <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                            {session.status === DateProgress.Done
                                ? t("label.date-planned")
                                : t("label.round", { round: session.round })}
                        </p>
                    </div>
                    <Button plain={true} onClick={onBack}>
                        {t("button.later")}
                    </Button>
                </header>

                <div className={"flex items-center gap-3 px-4 py-3"}>
                    <HeartIcon className={clsx("size-4", meterText)} />
                    <div
                        role={"meter"}
                        aria-label={t("accessibility.chemistry")}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={session.chemistry}
                        className={"h-2 flex-1 overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/10"}
                    >
                        <motion.div
                            className={clsx("h-full rounded-full", meter)}
                            animate={{ width: `${session.chemistry}%` }}
                            transition={{ duration: 0.4 }}
                        />
                    </div>
                    <span className={clsx("w-8 text-right text-sm font-bold tabular-nums", meterText)}>
                        {session.chemistry}
                    </span>
                </div>

                <div className={"flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-2"}>
                    <div className={"flex flex-col gap-2"}>
                        {messages.map((message, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={clsx(
                                    "flex flex-col",
                                    message.from === "player" ? "items-end" : "items-start",
                                )}
                            >
                                <span
                                    className={clsx(
                                        "max-w-[80%] px-3.5 py-2.5 text-[0.95rem]/snug",
                                        message.from === "player"
                                            ? "rounded-2xl rounded-br-sm bg-lime-400 font-semibold text-lime-950"
                                            : "rounded-2xl rounded-bl-sm bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
                                    )}
                                >
                                    {t(message.key, {
                                        theme: message.theme,
                                        level: message.level ? t(message.level) : undefined,
                                    })}
                                </span>
                                {message.delta !== undefined && (
                                    <span
                                        className={clsx(
                                            "mt-1 rounded-full px-2 py-0.5 text-[0.7rem] font-bold",
                                            message.delta > 0
                                                ? "bg-lime-400/20 text-lime-700 dark:text-lime-300"
                                                : message.delta < 0
                                                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                                        )}
                                    >
                                        {message.delta > 0 ? `+${message.delta}` : message.delta}
                                    </span>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className={"flex flex-col gap-2.5 border-t border-zinc-950/5 px-4 pt-3 pb-5 dark:border-white/5"}>
                    {answering && (
                        <>
                            <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>
                                {t("description.how-much", { theme: session.proposal?.label })}
                            </p>
                            <div className={"grid grid-cols-2 gap-2"}>
                                {ANSWERS.map((level) => (
                                    <button
                                        key={level}
                                        type={"button"}
                                        disabled={busy}
                                        onClick={() => onAnswer(level)}
                                        className={clsx(
                                            CHOICE,
                                            level === ThemeLevel.allin
                                                ? "bg-lime-400 text-lime-950 ring-lime-500"
                                                : level === ThemeLevel.avoid
                                                  ? clsx(QUIET, "text-red-700! dark:text-red-300!")
                                                  : QUIET,
                                        )}
                                    >
                                        {t(levelKey(level))}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {picking && (
                        <>
                            <p className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("description.your-turn")}</p>
                            <div className={"flex flex-wrap gap-1.5"}>
                                {session.palette.map((theme) => (
                                    <button
                                        key={theme.theme}
                                        type={"button"}
                                        aria-pressed={mine?.theme === theme.theme}
                                        onClick={() => setMine(mine?.theme === theme.theme ? null : theme)}
                                        className={clsx(
                                            CHOICE,
                                            "min-h-10 rounded-full px-3.5",
                                            mine?.theme === theme.theme
                                                ? "bg-lime-400 text-lime-950 ring-lime-500"
                                                : QUIET,
                                        )}
                                    >
                                        {theme.label}
                                    </button>
                                ))}
                            </div>
                            {mine === null ? (
                                <button
                                    type={"button"}
                                    disabled={busy}
                                    onClick={onDateNight}
                                    className={clsx(
                                        CHOICE,
                                        "bg-transparent text-lime-700 ring-lime-500 dark:text-lime-400",
                                    )}
                                >
                                    {t("button.date-night")}
                                </button>
                            ) : (
                                <div className={"grid grid-cols-3 gap-2"}>
                                    {BRINGS.map((level) => (
                                        <button
                                            key={level}
                                            type={"button"}
                                            disabled={busy}
                                            onClick={async () => {
                                                await onBring(mine.theme, level);
                                                setMine(null);
                                            }}
                                            className={clsx(CHOICE, QUIET)}
                                        >
                                            {t(levelKey(level))}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {session.status !== DateProgress.Active && (
                    <motion.div
                        role={"dialog"}
                        aria-modal={true}
                        className={
                            "fixed inset-0 z-50 flex flex-col justify-center gap-5 bg-zinc-950/95 px-8 py-10 text-white"
                        }
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {session.status === DateProgress.Done ? (
                            <>
                                <h2 className={"text-4xl font-extrabold tracking-tight text-lime-400"}>
                                    {t("heading.date-done")}
                                </h2>
                                <p className={"text-zinc-300"}>{t("description.date-plan", { name: session.name })}</p>
                                <ul className={"flex flex-col gap-1.5"}>
                                    {session.turns.map((turn) => (
                                        <li
                                            key={turn.theme}
                                            className={
                                                "flex items-center justify-between rounded-(--radius-control) bg-zinc-900 px-3.5 py-2.5"
                                            }
                                        >
                                            <span className={"font-semibold"}>{turn.label}</span>
                                            <span
                                                className={clsx(
                                                    "rounded-full px-2.5 py-0.5 text-xs font-bold",
                                                    turn.level === ThemeLevel.avoid
                                                        ? "bg-red-950 text-red-300"
                                                        : turn.level === ThemeLevel.allin
                                                          ? "bg-lime-400 text-lime-950"
                                                          : "bg-zinc-800 text-zinc-200",
                                                )}
                                            >
                                                {t(levelKey(turn.level))}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <PrimaryButton onClick={onMeetCards}>{t("button.meet-cards")}</PrimaryButton>
                            </>
                        ) : (
                            <div className={"flex flex-col items-center gap-5 text-center"}>
                                <span
                                    className={
                                        "size-26 overflow-hidden rounded-full border-4 border-zinc-600 bg-zinc-800 grayscale"
                                    }
                                >
                                    {session.image_art_crop && (
                                        <img
                                            src={session.image_art_crop}
                                            alt={t("accessibility.art", { name: session.name })}
                                            crossOrigin={"anonymous"}
                                            className={"size-full object-cover object-[center_35%]"}
                                        />
                                    )}
                                </span>
                                <h2 className={"text-3xl font-extrabold"}>
                                    {t("heading.date-left", { name: session.name })}
                                </h2>
                                {leftLine && <p className={"text-lg text-zinc-200"}>{leftLine}</p>}
                                <div className={"flex w-full flex-col gap-3"}>
                                    <button
                                        type={"button"}
                                        disabled={busy}
                                        onClick={onComeBack}
                                        className={
                                            "h-11 rounded-(--radius-control) border-2 border-lime-400 font-semibold text-lime-400 hover:bg-lime-400/10 disabled:opacity-50"
                                        }
                                    >
                                        {t("button.come-back")}
                                    </button>
                                    <Button plain={true} className={"text-white!"} onClick={onBuildAnyway}>
                                        {t("button.build-anyway")}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
