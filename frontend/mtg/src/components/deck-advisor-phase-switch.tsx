import { AdjustmentsHorizontalIcon, SparklesIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { useTranslation } from "react-i18next";
import { QuietButton } from "src/components/quiet-button";
import type { AdvisorPhase } from "src/routes/_menu/decks/$deckUuid/_deck/advisor";

/**
 * Props for {@link DeckAdvisorPhaseSwitch}
 */
export type DeckAdvisorPhaseSwitchProps = {
    /** What's actually showing */
    phase: AdvisorPhase;
    /** What the card count alone would pick */
    autoPhase: AdvisorPhase;
    /** Picks a phase explicitly */
    onSelect: (phase: AdvisorPhase) => void;
    /** The assumptions summary line, already joined */
    assumptions: string;
    onOpenAssumptions: () => void;
    onOpenTune: () => void;
    onOpenCombos: () => void;
    onFill: () => void;
};

/**
 * The advisor page header: phase label, override pill, and action icons.
 *
 * Shows what the page is currently focused on (trim/build/refine), with a
 * three-button override control for manual switching. When the phase
 * disagrees with the auto-derived one, an inline hint explains why.
 *
 * @returns the header row
 */
export function DeckAdvisorPhaseSwitch({
    phase,
    autoPhase,
    onSelect,
    assumptions,
    onOpenAssumptions,
    onOpenTune,
    onOpenCombos,
    onFill,
}: DeckAdvisorPhaseSwitchProps) {
    const [t] = useTranslation("advisor");

    const isOverridden = phase !== autoPhase;

    return (
        <div className={"flex flex-wrap items-center justify-between gap-4"}>
            {/* Left: phase label and override control */}
            <div className={"flex items-center gap-3"}>
                {/* Phase label pill */}
                <span
                    className={clsx(
                        "rounded-(--radius-pill) px-3 py-1.5 text-sm font-medium ring-1",
                        phase === "trim"
                            ? "bg-amber-500/10 text-amber-700 ring-amber-600/20 dark:text-amber-300 dark:ring-amber-400/25"
                            : phase === "refine"
                              ? "bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:text-violet-300 dark:ring-violet-400/25"
                              : "bg-(--color-accent)/10 text-blue-700 ring-(--color-accent)/20 dark:text-blue-300 dark:ring-(--color-accent)/25",
                    )}
                >
                    {t(`label.phase-${phase}`)}
                </span>

                {/* Override pills */}
                <div
                    className={
                        "flex items-center gap-1 rounded-(--radius-pill) bg-zinc-200/50 p-1 ring-1 ring-zinc-950/10 dark:bg-zinc-700/50 dark:ring-white/10"
                    }
                    role={"group"}
                    aria-label={t("accessibility.phase-switch")}
                >
                    <button
                        onClick={() => onSelect("trim")}
                        aria-pressed={phase === "trim"}
                        className={clsx(
                            "rounded-(--radius-pill) px-2.5 py-1 text-sm font-medium transition-colors",
                            phase === "trim"
                                ? "bg-white text-zinc-900 shadow-(--shadow-card-sm) dark:bg-zinc-800 dark:text-white"
                                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                        )}
                    >
                        {t("button.view-trim")}
                    </button>
                    <button
                        onClick={() => onSelect("build")}
                        aria-pressed={phase === "build"}
                        className={clsx(
                            "rounded-(--radius-pill) px-2.5 py-1 text-sm font-medium transition-colors",
                            phase === "build"
                                ? "bg-white text-zinc-900 shadow-(--shadow-card-sm) dark:bg-zinc-800 dark:text-white"
                                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                        )}
                    >
                        {t("button.view-build")}
                    </button>
                    <button
                        onClick={() => onSelect("refine")}
                        aria-pressed={phase === "refine"}
                        className={clsx(
                            "rounded-(--radius-pill) px-2.5 py-1 text-sm font-medium transition-colors",
                            phase === "refine"
                                ? "bg-white text-zinc-900 shadow-(--shadow-card-sm) dark:bg-zinc-800 dark:text-white"
                                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                        )}
                    >
                        {t("button.view-refine")}
                    </button>
                </div>

                {/* Auto-hint when overridden */}
                {isOverridden && (
                    <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>{t("label.phase-auto-hint")}</span>
                )}
            </div>

            {/* Right: assumptions, tune, combos, fill */}
            <div className={"flex min-w-0 flex-wrap items-center gap-3"}>
                <QuietButton onClick={onOpenAssumptions} className={"max-w-full"}>
                    <AdjustmentsHorizontalIcon className={"size-3.5 shrink-0"} />
                    <span className={"truncate"}>{assumptions}</span>
                </QuietButton>

                <button
                    onClick={onOpenTune}
                    title={t("accessibility.open-tune")}
                    aria-label={t("accessibility.open-tune")}
                    className={
                        "rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                    }
                >
                    <AdjustmentsHorizontalIcon className={"size-4"} />
                </button>

                <button
                    onClick={onOpenCombos}
                    title={t("accessibility.open-combos")}
                    aria-label={t("accessibility.open-combos")}
                    className={
                        "rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                    }
                >
                    <SparklesIcon className={"size-4"} />
                </button>

                <Button outline onClick={onFill}>
                    {t("button.fill")}
                </Button>
            </div>
        </div>
    );
}
