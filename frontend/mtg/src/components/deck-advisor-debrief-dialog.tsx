import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/16/solid";
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "components";
import clsx from "clsx";
import { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Direction, Fix, MAX_PROBLEMS, PROBLEMS, Shift } from "src/utils/advisor-directions";

/**
 * The properties for {@link DeckAdvisorDebriefDialog}
 */
export type DeckAdvisorDebriefDialogProps = {
    open: boolean;
    /** The deck's name, for the question */
    deckName: string;
    /** Tunes the deck for the chosen directions */
    onTune: (directions: Array<Direction>) => void;
    /** The deck played well: nothing changes */
    onFine: () => void;
    /** Opens the goals instead, for anything the list does not cover */
    onSomethingElse: () => void;
    /** Asks again another day */
    onLater: () => void;
};

/**
 * What a fix moves, as the same up and down badges a move carries: what it
 * raises in lime, what it costs in amber
 *
 * @param t the advisor namespace's translator
 * @param shift the fix's shift
 *
 * @returns one entry per moved target
 */
export function shiftBadges(t: TFunction, shift: Shift): Array<{ key: string; name: string; up: boolean }> {
    return [
        ...Object.entries(shift.buckets ?? {}).map(([id, by]) => ({
            key: `bucket:${id}`,
            name: t(`label.bucket-${id.replace(/_/g, "-")}`),
            up: by > 0,
        })),
        ...Object.entries(shift.types ?? {}).map(([id, by]) => ({
            key: `type:${id}`,
            name: t(`label.impact-type-${id.toLowerCase()}`),
            up: by > 0,
        })),
        ...Object.entries(shift.curve ?? {}).map(([mv, by]) => ({
            key: `curve:${mv}`,
            name: mv === "6" ? t("label.impact-curve-top") : t("label.impact-curve", { mv }),
            up: by > 0,
        })),
    ].sort((a, b) => Number(b.up) - Number(a.up));
}

/**
 * A fix's badges
 *
 * @returns the row
 */
export function FixBadges({ fix }: { fix: Fix }) {
    const [t] = useTranslation("advisor");
    return (
        <span className={"flex flex-wrap gap-1"}>
            {shiftBadges(t, fix.shift).map(({ key, name, up }) => {
                const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
                return (
                    <Badge key={key} color={up ? "lime" : "amber"}>
                        <Arrow className={"size-3 shrink-0"} aria-hidden={"true"} />
                        {name}
                    </Badge>
                );
            })}
        </span>
    );
}

/**
 * Asked after the deck has been played: what went wrong, then which way to
 * change it. Each answer is a direction with a visible price.
 *
 * @returns the dialog
 */
export function DeckAdvisorDebriefDialog({
    open,
    deckName,
    onTune,
    onFine,
    onSomethingElse,
    onLater,
}: DeckAdvisorDebriefDialogProps) {
    const [t] = useTranslation("advisor");
    const [step, setStep] = useState<1 | 2>(1);
    const [problems, setProblems] = useState<Array<string>>([]);
    const [picks, setPicks] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setProblems([]);
        setPicks({});
    }, [open]);

    const full = problems.length >= MAX_PROBLEMS;

    /**
     * Picks a problem, or lets go of it
     *
     * @param id the problem
     */
    function toggle(id: string) {
        setProblems((held) => (held.includes(id) ? held.filter((p) => p !== id) : [...held, id]));
    }

    /** Hands the chosen directions over, the first fix where none was picked */
    function tune() {
        onTune(
            problems.map((id) => ({
                problem: id,
                fix: picks[id] ?? PROBLEMS.find((p) => p.id === id)?.fixes[0].id ?? "",
            })),
        );
    }

    return (
        <Dialog open={open} onClose={onLater} size={"xl"}>
            {step === 1 ? (
                <>
                    <DialogTitle>{t("heading.debrief", { name: deckName })}</DialogTitle>
                    <DialogDescription>{t("description.debrief-pick")}</DialogDescription>
                    <DialogBody>
                        <div className={"grid grid-cols-1 gap-2 sm:grid-cols-2"}>
                            {PROBLEMS.map((problem) => {
                                const on = problems.includes(problem.id);
                                return (
                                    <button
                                        key={problem.id}
                                        type={"button"}
                                        aria-pressed={on}
                                        disabled={full && !on}
                                        onClick={() => toggle(problem.id)}
                                        className={clsx(
                                            "rounded-(--radius-control) px-4 py-3 text-left text-sm/6 font-medium ring-1 transition disabled:opacity-40",
                                            on
                                                ? "bg-lime-400/15 text-zinc-950 ring-lime-600 dark:text-white dark:ring-lime-300"
                                                : "bg-zinc-950/[0.03] text-zinc-950 ring-zinc-950/10 enabled:hover:ring-lime-600/40 dark:bg-white/[0.04] dark:text-white dark:ring-white/10",
                                        )}
                                    >
                                        {t(`label.problem-${problem.id}`)}
                                    </button>
                                );
                            })}
                            <button
                                type={"button"}
                                onClick={onSomethingElse}
                                className={
                                    "rounded-(--radius-control) border border-dashed border-zinc-950/20 px-4 py-3 text-sm/6 font-medium text-zinc-500 transition hover:border-lime-600/50 hover:text-lime-700 sm:col-span-2 dark:border-white/20 dark:text-zinc-400 dark:hover:text-lime-300"
                                }
                            >
                                {t("button.something-else")}
                            </button>
                        </div>
                    </DialogBody>
                    <DialogActions>
                        <Button plain onClick={onLater}>
                            {t("button.not-now")}
                        </Button>
                        {problems.length === 0 ? (
                            <Button color={"lime"} onClick={onFine}>
                                {t("button.played-well")}
                            </Button>
                        ) : (
                            <Button color={"lime"} onClick={() => setStep(2)}>
                                {t("button.next")}
                            </Button>
                        )}
                    </DialogActions>
                </>
            ) : (
                <>
                    <DialogTitle>{t("heading.debrief-direction")}</DialogTitle>
                    <DialogBody>
                        <div className={"flex flex-col gap-5"}>
                            {problems.map((id) => {
                                const problem = PROBLEMS.find((p) => p.id === id);
                                if (problem === undefined) return null;
                                const picked = picks[id] ?? problem.fixes[0].id;
                                return (
                                    <fieldset key={id} className={"flex flex-col gap-2"}>
                                        <legend
                                            className={"mb-2 text-sm/6 font-semibold text-zinc-950 dark:text-white"}
                                        >
                                            {t(`label.problem-${id}`)}
                                        </legend>
                                        {problem.fixes.map((fix) => (
                                            <label
                                                key={fix.id}
                                                className={clsx(
                                                    "flex cursor-pointer items-start gap-3 rounded-(--radius-control) p-3 ring-1 transition",
                                                    picked === fix.id
                                                        ? "bg-lime-400/10 ring-lime-600 dark:ring-lime-300"
                                                        : "ring-zinc-950/10 hover:ring-lime-600/40 dark:ring-white/10",
                                                )}
                                            >
                                                <input
                                                    type={"radio"}
                                                    name={`fix-${id}`}
                                                    id={`fix-${id}-${fix.id}`}
                                                    checked={picked === fix.id}
                                                    onChange={() => setPicks((held) => ({ ...held, [id]: fix.id }))}
                                                    className={"mt-1 accent-lime-600"}
                                                />
                                                <span className={"flex flex-col gap-1"}>
                                                    <span
                                                        className={
                                                            "text-sm/6 font-medium text-zinc-950 dark:text-white"
                                                        }
                                                    >
                                                        {t(`label.fix-${fix.id}`)}
                                                    </span>
                                                    <span className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                                                        {t(`label.fix-cost-${fix.id}`)}
                                                    </span>
                                                    <FixBadges fix={fix} />
                                                </span>
                                            </label>
                                        ))}
                                    </fieldset>
                                );
                            })}
                        </div>
                    </DialogBody>
                    <DialogActions>
                        <Button plain onClick={() => setStep(1)}>
                            {t("button.back")}
                        </Button>
                        <Button color={"lime"} onClick={tune}>
                            {t("button.tune")}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}
