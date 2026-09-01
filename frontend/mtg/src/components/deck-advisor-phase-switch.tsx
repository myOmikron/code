import { AdjustmentsHorizontalIcon, RectangleStackIcon } from "@heroicons/react/20/solid";
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
    /** Picks a phase explicitly */
    onSelect: (phase: AdvisorPhase) => void;
    /** The assumptions summary line, already joined */
    assumptions: string;
    onOpenAssumptions: () => void;
    onFill: () => void;
};

/**
 * The advisor page header: the phase switch and the two actions.
 *
 * The three-state switch is the whole statement of where the deck is —
 * trim, build, refine. It carries no separate status pill and no note about
 * where the default came from: the pressed segment already says it, and the
 * page is free to be overridden at any time anyway.
 *
 * Only two things sit on the right: what the advice assumes, and Fill. The
 * icons that opened the targets and the combos dialogs are gone — the targets
 * are panels in the refine cockpit, where they can be argued with in place.
 *
 * @returns the header row
 */
export function DeckAdvisorPhaseSwitch({
    phase,
    onSelect,
    assumptions,
    onOpenAssumptions,
    onFill,
}: DeckAdvisorPhaseSwitchProps) {
    const [t] = useTranslation("advisor");

    /**
     * The pressed and unpressed looks of one segment
     *
     * @param pressed whether this segment is the showing phase
     * @returns the segment's classes
     */
    const segment = (pressed: boolean) =>
        clsx(
            "rounded-(--radius-pill) px-5 py-2 text-base font-medium transition-colors",
            pressed
                ? "bg-white text-zinc-900 shadow-(--shadow-card-sm) dark:bg-zinc-800 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
        );

    return (
        <div className={"flex flex-wrap items-center justify-between gap-4"}>
            {/* Left: the phase switch */}
            <div
                className={
                    "flex items-center gap-1 rounded-(--radius-pill) bg-zinc-200/50 p-1.5 ring-1 ring-zinc-950/10 dark:bg-zinc-700/50 dark:ring-white/10"
                }
                role={"group"}
                aria-label={t("accessibility.phase-switch")}
            >
                <button
                    onClick={() => onSelect("trim")}
                    aria-pressed={phase === "trim"}
                    className={segment(phase === "trim")}
                >
                    {t("button.view-trim")}
                </button>
                <button
                    onClick={() => onSelect("build")}
                    aria-pressed={phase === "build"}
                    className={segment(phase === "build")}
                >
                    {t("button.view-build")}
                </button>
                <button
                    onClick={() => onSelect("refine")}
                    aria-pressed={phase === "refine"}
                    className={segment(phase === "refine")}
                >
                    {t("button.view-refine")}
                </button>
            </div>

            {/* Right: assumptions and fill */}
            <div className={"flex min-w-0 flex-wrap items-center gap-3"}>
                <QuietButton onClick={onOpenAssumptions} className={"max-w-full"}>
                    <AdjustmentsHorizontalIcon className={"size-3.5 shrink-0"} />
                    <span className={"truncate"}>{assumptions}</span>
                </QuietButton>

                {/* The stack is the app's "cards" glyph (collection, watch
                list) — filling up is asking for more of them. It replaces
                the "…" the label used to carry for "opens a dialog". */}
                <Button outline onClick={onFill}>
                    <RectangleStackIcon />
                    {t("button.fill")}
                </Button>
            </div>
        </div>
    );
}
