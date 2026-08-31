import { CheckIcon } from "@heroicons/react/16/solid";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogBody, DialogTitle, Text, notify } from "components";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BracketRulesResponse, DeckResponse } from "src/api/generated";
import { DeckAdvisorPool } from "src/components/deck-advisor-pool";
import { useDeckLabels } from "src/components/deck-labels";
import { DeckThemePicker } from "src/components/deck-theme-picker";
import { DialogCloseButton } from "src/components/dialog-close-button";
import { AdvisorSettings } from "src/utils/advisor-settings";
import { DEFAULT_TARGETS, withCurve } from "src/utils/deck-targets";

/** A step of the wizard, numbered as the reader sees it */
type Step = 1 | 2 | 3 | 4;

/** The shape offered on step 2 — one of the two presets, or the bracket's own curve */
type ShapeChoice = "fast" | "balanced" | "big";

/** The restriction offered on step 4 */
type BudgetChoice = "cap100" | "cap5" | "none" | "custom";

/**
 * Card counts for a 63-spell deck, one preset each.
 *
 * Counts, not shares: {@link withCurve} normalises them into shares on
 * commit, the same way the refine cockpit's curve editor does, so a shape
 * picked here means the same thing whatever size the deck grows to.
 */
const SHAPE_COUNTS: Record<Exclude<ShapeChoice, "balanced">, Array<number>> = {
    fast: [2, 9, 16, 14, 12, 6, 4],
    big: [2, 5, 10, 13, 15, 11, 7],
};

/** The two presets' shares, precomputed once for matching a re-run's stored curve back to a choice */
const SHAPE_SHARES: Record<Exclude<ShapeChoice, "balanced">, Array<number>> = {
    fast: withCurve(DEFAULT_TARGETS, SHAPE_COUNTS.fast).curve ?? [],
    big: withCurve(DEFAULT_TARGETS, SHAPE_COUNTS.big).curve ?? [],
};

/** The bracket the wizard preselects when the deck claims none — what the advisor already assumes when it has to guess */
const DEFAULT_BRACKET = 3;

/**
 * Whether two curves are the same shape, up to floating-point noise
 *
 * @param stored what the settings currently hold
 * @param preset the preset's own shares
 *
 * @returns true when every share is within a hair of its counterpart
 */
function sameShape(stored: Array<number> | null, preset: Array<number>): boolean {
    return (
        stored !== null &&
        stored.length === preset.length &&
        stored.every((share, mv) => Math.abs(share - preset[mv]) < 1e-6)
    );
}

/**
 * Which shape choice a stored curve matches, for pre-filling a re-run
 *
 * @param curve what the settings currently hold
 *
 * @returns the matching preset, or "balanced" for anything else, including `null`
 */
function shapeChoiceFor(curve: Array<number> | null): ShapeChoice {
    if (sameShape(curve, SHAPE_SHARES.fast)) return "fast";
    if (sameShape(curve, SHAPE_SHARES.big)) return "big";
    return "balanced";
}

/**
 * Which budget choice a stored pool query matches, for pre-filling a re-run
 *
 * @param query what the settings currently hold
 *
 * @returns the matching preset, or "custom" for anything else
 */
function budgetChoiceFor(query: string | null): BudgetChoice {
    if (query === "eur<100") return "cap100";
    if (query === "eur<5") return "cap5";
    if (query === null) return "none";
    return "custom";
}

/**
 * The properties for {@link DeckAdvisorSetup}
 */
export type DeckAdvisorSetupProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away, writing nothing but `setup_done` */
    onClose: () => void;
    /** The deck the setup is for, for its currently claimed bracket */
    deck: DeckResponse;
    /** The five brackets as the server defines them, already loaded by the deck route */
    brackets: Array<BracketRulesResponse>;
    /** What is in force right now — every step is pre-filled from this */
    settings: AdvisorSettings;
    /** Replaces the whole settings document */
    onSave: (next: AdvisorSettings) => void;
    /** Claims a bracket for the deck itself, or leaves it unsaid with `null` */
    onSaveBracket: (bracket: number | null) => void;
    /** How many cards read as each theme, by id — the detection, for step 1's reference */
    detected: Record<string, number>;
};

/**
 * Four questions the advisor otherwise guesses at, asked once: what the deck
 * plays, what shape it should be, what table it is for, and what it may
 * spend.
 *
 * Nothing is compulsory. `Use defaults` on step 1 answers all four questions
 * sensibly and closes — it is the offer at the door, and it appears nowhere
 * else, because a reader who has walked past it is answering the questions,
 * not looking for a way to discard what they just typed. The × and Escape
 * write nothing beyond `setup_done`, so a stray dismissal never applies a
 * price ceiling nobody chose.
 *
 * Every answer but the bracket lands in one `onSave` call, made exactly once
 * per exit — never a write per step. The bracket is the one answer that
 * belongs to the deck rather than to the reader (it already has its own
 * endpoint and its own chip), so it is written the moment step 3 is left,
 * through `onSaveBracket`.
 *
 * @returns the dialog
 */
export function DeckAdvisorSetup({
    open,
    onClose,
    deck,
    brackets,
    settings,
    onSave,
    onSaveBracket,
    detected,
}: DeckAdvisorSetupProps) {
    const [t] = useTranslation("advisor");
    const labels = useDeckLabels();

    const [step, setStep] = useState<Step>(1);
    const [draftThemes, setDraftThemes] = useState<Array<string>>(settings.themes.pinned);
    const [shapeChoice, setShapeChoice] = useState<ShapeChoice>("balanced");
    const [draftBracket, setDraftBracket] = useState<number | null>(deck.bracket ?? null);
    const [budgetChoice, setBudgetChoice] = useState<BudgetChoice>("cap100");
    const [draftPoolQuery, setDraftPoolQuery] = useState<string | null>("eur<100");

    // Re-seeded per opening, from whatever is in force — a first run and a
    // re-run land on the same code path, because re-running pre-fills
    // rather than resetting (Decision: finishing it is an edit). Only the
    // budget's starting point differs by which this is: a reader who has
    // never been through the wizard sees the €100 ceiling offered, not the
    // "no limit" their still-untouched settings would otherwise suggest.
    useEffect(() => {
        if (!open) return;
        setStep(1);
        setDraftThemes(settings.themes.pinned);
        setShapeChoice(shapeChoiceFor(settings.targets.curve));
        setDraftBracket(deck.bracket ?? null);
        const initialQuery = settings.setup_done ? settings.pool_query : "eur<100";
        setDraftPoolQuery(initialQuery);
        setBudgetChoice(budgetChoiceFor(initialQuery));
    }, [open]);

    /**
     * Adds or removes one theme from the draft picks
     *
     * @param theme the theme id that was clicked
     */
    function toggleTheme(theme: string) {
        setDraftThemes((held) => (held.includes(theme) ? held.filter((id) => id !== theme) : [...held, theme]));
    }

    /**
     * Picks one of the two fixed budget presets, or clears the restriction
     *
     * @param choice the preset clicked
     */
    function pickBudget(choice: Exclude<BudgetChoice, "custom">) {
        setBudgetChoice(choice);
        setDraftPoolQuery(choice === "cap100" ? "eur<100" : choice === "cap5" ? "eur<5" : null);
    }

    /**
     * The offer at the door: answers all four questions with their sensible
     * defaults and closes, skipping the rest of the flow entirely.
     */
    function useDefaults() {
        onSave({
            ...settings,
            themes: { ...settings.themes, pinned: [] },
            targets: { ...settings.targets, curve: null },
            pool_query: "eur<100",
            setup_done: true,
        });
        notify.success(t("toast.setup-saved"));
        onClose();
    }

    /**
     * Writes nothing but `setup_done` and closes — the × and Escape path.
     */
    function dismiss() {
        onSave({ ...settings, setup_done: true });
        onClose();
    }

    /**
     * Commits every draft answer in one write and closes — the step 4 "Start
     * advising" path.
     */
    function finish() {
        const curve =
            shapeChoice === "balanced" ? null : (withCurve(DEFAULT_TARGETS, SHAPE_COUNTS[shapeChoice]).curve ?? null);
        onSave({
            ...settings,
            themes: { ...settings.themes, pinned: draftThemes },
            targets: { ...settings.targets, curve },
            pool_query: draftPoolQuery,
            setup_done: true,
        });
        notify.success(t("toast.setup-saved"));
        onClose();
    }

    /**
     * Advances to the next step, or finishes on the last one.
     *
     * The bracket is written here rather than staged, the moment step 3 is
     * left — it is the one answer that belongs to the deck itself, and it
     * already has its own endpoint.
     */
    function next() {
        if (step === 3) onSaveBracket(draftBracket);
        if (step === 4) {
            finish();
            return;
        }
        setStep((current) => (current + 1) as Step);
    }

    /** Steps back one, no lower than the first */
    function back() {
        setStep((current) => Math.max(1, current - 1) as Step);
    }

    const stepTitle = {
        1: t("heading.setup-themes"),
        2: t("heading.setup-shape"),
        3: t("heading.setup-bracket"),
        4: t("heading.setup-budget"),
    }[step];

    return (
        // A stable accessible name across all four steps (the visible
        // `DialogTitle` changes with the question being asked) — `aria-label`
        // wins over the `aria-labelledby` `DialogTitle` sets up, on purpose.
        <Dialog open={open} onClose={dismiss} size={"2xl"} aria-label={t("heading.setup")}>
            <DialogTitle className={"flex items-center gap-3"}>
                <span className={"min-w-0 flex-1"}>{stepTitle}</span>
                <DialogCloseButton onClose={dismiss} />
            </DialogTitle>
            <DialogBody>
                {step === 1 && (
                    <>
                        <Text>{t("description.setup-themes")}</Text>
                        <DeckThemePicker picked={draftThemes} onToggle={toggleTheme} detected={detected} />
                    </>
                )}

                {step === 2 && (
                    <>
                        <Text>{t("description.setup-shape")}</Text>
                        <div className={"mt-5 flex flex-col gap-2"}>
                            <OptionRow
                                chosen={shapeChoice === "fast"}
                                onClick={() => setShapeChoice("fast")}
                                name={t("label.setup-shape-fast")}
                                note={t("label.setup-shape-fast-note")}
                                lead={<Sparkline counts={SHAPE_COUNTS.fast} />}
                            />
                            <OptionRow
                                chosen={shapeChoice === "balanced"}
                                onClick={() => setShapeChoice("balanced")}
                                name={t("label.setup-shape-balanced")}
                                note={t("label.setup-shape-balanced-note")}
                                lead={<span className={"h-8 w-20 shrink-0"} aria-hidden={"true"} />}
                            />
                            <OptionRow
                                chosen={shapeChoice === "big"}
                                onClick={() => setShapeChoice("big")}
                                name={t("label.setup-shape-big")}
                                note={t("label.setup-shape-big-note")}
                                lead={<Sparkline counts={SHAPE_COUNTS.big} />}
                            />
                        </div>
                    </>
                )}

                {step === 3 && (
                    <>
                        <Text>{t("description.setup-bracket")}</Text>
                        <div className={"mt-5 flex flex-col gap-2"}>
                            {brackets.map((rules) => (
                                <OptionRow
                                    key={rules.number}
                                    chosen={(draftBracket ?? DEFAULT_BRACKET) === rules.number}
                                    onClick={() => setDraftBracket(rules.number)}
                                    name={`${rules.number} · ${labels.bracket(rules.slug)}`}
                                />
                            ))}
                        </div>
                        <div
                            className={
                                "mt-4 flex items-start gap-2 rounded-(--radius-control) bg-amber-500/5 px-3 py-2.5 ring-1 ring-amber-600/20 dark:ring-amber-400/25"
                            }
                        >
                            <ExclamationTriangleIcon
                                className={"mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"}
                                aria-hidden={"true"}
                            />
                            <Text className={"text-xs/5"}>{t("description.setup-bracket-shared")}</Text>
                        </div>
                    </>
                )}

                {step === 4 && (
                    <>
                        <Text>{t("description.setup-budget")}</Text>
                        <div className={"mt-5 flex flex-col gap-2"}>
                            <OptionRow
                                chosen={budgetChoice === "cap100"}
                                onClick={() => pickBudget("cap100")}
                                name={t("label.setup-budget-100")}
                                note={t("label.setup-budget-100-note")}
                            />
                            <OptionRow
                                chosen={budgetChoice === "cap5"}
                                onClick={() => pickBudget("cap5")}
                                name={t("label.setup-budget-5")}
                            />
                            <OptionRow
                                chosen={budgetChoice === "none"}
                                onClick={() => pickBudget("none")}
                                name={t("label.setup-budget-none")}
                            />
                            <OptionRow
                                chosen={budgetChoice === "custom"}
                                onClick={() => setBudgetChoice("custom")}
                                name={t("label.setup-budget-custom")}
                            />
                        </div>
                        {budgetChoice === "custom" && (
                            <div className={"mt-3"}>
                                <DeckAdvisorPool applied={draftPoolQuery} onApply={setDraftPoolQuery} />
                            </div>
                        )}
                    </>
                )}

                <div
                    className={
                        "mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-950/10 pt-5 dark:border-white/10"
                    }
                >
                    <div className={"flex items-center gap-2"}>
                        <ol className={"flex items-center gap-1.5"} aria-hidden={"true"}>
                            {([1, 2, 3, 4] as const).map((mark) => (
                                <li
                                    key={mark}
                                    className={clsx(
                                        "size-1.5 rounded-full",
                                        mark === step
                                            ? "bg-(--color-accent)"
                                            : mark < step
                                              ? "bg-zinc-400 dark:bg-zinc-500"
                                              : "bg-zinc-950/15 dark:bg-white/15",
                                    )}
                                />
                            ))}
                        </ol>
                        <span className={"text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                            {t("label.setup-step", { current: step, total: 4 })}
                        </span>
                    </div>
                    <div className={"flex items-center gap-2"}>
                        {step === 1 && (
                            <Button color={"blue"} onClick={useDefaults}>
                                {t("button.setup-defaults")}
                            </Button>
                        )}
                        {step > 1 && (
                            <Button plain onClick={back}>
                                {t("button.setup-back")}
                            </Button>
                        )}
                        {step === 4 ? (
                            <Button color={"blue"} onClick={next}>
                                {t("button.setup-start")}
                            </Button>
                        ) : (
                            <Button outline onClick={next}>
                                {t("button.setup-next")}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogBody>
        </Dialog>
    );
}

/** The properties for {@link OptionRow} */
type OptionRowProps = {
    /** Whether this option is the one currently picked */
    chosen: boolean;
    /** Picks this option */
    onClick: () => void;
    /** The option's name */
    name: string;
    /** A short explanation, omitted for an option that speaks for itself */
    note?: string;
    /** A visual lead — a sparkline, so far — kept the same width across a step's rows so the text stays aligned */
    lead?: ReactNode;
};

/**
 * One selectable row, shared by the shape, bracket and budget steps: a name,
 * an optional note, and a check that fills in once it is the pick.
 *
 * @returns the row
 */
function OptionRow({ chosen, onClick, name, note, lead }: OptionRowProps) {
    return (
        <button
            type={"button"}
            onClick={onClick}
            aria-pressed={chosen}
            className={clsx(
                "flex w-full items-center gap-3.5 rounded-(--radius-control) px-3.5 py-3 text-left transition",
                chosen
                    ? "bg-(--color-accent)/10 text-(--color-brand-700) ring-1 ring-(--color-accent)/30 dark:text-(--color-brand-300)"
                    : "text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-white dark:ring-white/15 dark:hover:bg-white/5",
            )}
        >
            {lead}
            <span className={"min-w-0 flex-1"}>
                <span className={"block text-sm/6 font-medium"}>{name}</span>
                {note !== undefined && (
                    <span
                        className={clsx("block text-xs/5", chosen ? "opacity-80" : "text-zinc-500 dark:text-zinc-400")}
                    >
                        {note}
                    </span>
                )}
            </span>
            <CheckIcon className={clsx("size-4 shrink-0", chosen ? "opacity-100" : "opacity-0")} />
        </button>
    );
}

/** The properties for {@link Sparkline} */
type SparklineProps = {
    /** The counts to draw, tallest bar first or not — only their relative height matters */
    counts: Array<number>;
};

/**
 * A shape preset drawn as itself: seven bars, tallest at the preset's peak.
 *
 * @returns the sparkline
 */
function Sparkline({ counts }: SparklineProps) {
    const peak = Math.max(...counts);
    return (
        <span className={"flex h-8 w-20 shrink-0 items-end gap-0.5"} aria-hidden={"true"}>
            {counts.map((count, mv) => (
                <span
                    key={mv}
                    className={"flex-1 rounded-t-sm bg-current opacity-50"}
                    style={{ height: `${Math.max(8, (count / peak) * 100)}%` }}
                />
            ))}
        </span>
    );
}
