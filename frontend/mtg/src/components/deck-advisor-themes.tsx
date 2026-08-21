import { MinusCircleIcon, PlusCircleIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Diagnostics } from "src/api/graph-generated";
import { ThemePrefs, themeState } from "src/utils/deck-theme-prefs";

/** Below this share a detected theme is noise rather than identity */
const NOISE_FLOOR = 0.02;

/**
 * The properties for {@link DeckAdvisorThemes}
 */
export type DeckAdvisorThemesProps = {
    /** The report the themes were detected in */
    report: Diagnostics;
    /** What the advisor is currently told to favour and avoid */
    prefs: ThemePrefs;
    /** Walks one theme to its next state */
    onCycle: (themeId: string) => void;
    /**
     * Display names for themes the deck does not read as, by id.
     *
     * An orphaned chip has no report row to take a label from, and the id is
     * a poor stand-in — "vehicles" where every other chip says "Vehicles", and
     * "untap_combo" where one says "Untap combo". Whatever the caller knows is
     * used; the id remains the fallback.
     */
    labels?: Record<string, string>;
};

/**
 * The deck's detected themes, as chips the user can argue with.
 *
 * A click cycles one theme neutral → pinned → excluded → neutral. Pinned
 * themes are argued *for* when suggestions are ranked, excluded ones are
 * demoted — and the service says so in its notes, so the effect is never
 * something the reader has to take on trust.
 *
 * A theme the user has an opinion about is listed even when the deck no
 * longer reads as it, marked as undetected. That is not tidiness: an excluded
 * theme that disappeared from the profile would otherwise be impossible to
 * un-exclude, because the only control for it is the chip.
 *
 * @returns the chip row
 */
export function DeckAdvisorThemes({ report, prefs, onCycle, labels }: DeckAdvisorThemesProps) {
    const [t] = useTranslation("advisor");

    const detected = (report.themes ?? []).filter((theme) => theme.share >= NOISE_FLOOR);
    const known = new Set(detected.map((theme) => theme.theme));
    // Opinions the profile no longer supports, kept reachable.
    const orphaned = [...prefs.pinned, ...prefs.excluded]
        .filter((id) => !known.has(id))
        .map((id) => ({ theme: id, label: labels?.[id] ?? id.replace(/_/g, " "), share: 0 }));

    const chips = [...detected, ...orphaned];
    if (chips.length === 0) return null;

    return (
        <div className={"flex flex-col gap-1"}>
            <div className={"flex flex-wrap gap-1"}>
                {chips.map((theme) => {
                    const state = themeState(prefs, theme.theme);
                    const undetected = theme.share === 0;
                    return (
                        <button
                            key={theme.theme}
                            type={"button"}
                            onClick={() => onCycle(theme.theme)}
                            aria-pressed={state !== "neutral"}
                            title={t(`accessibility.theme-${state}`, { name: theme.label })}
                            className={clsx(
                                "flex items-center gap-1 rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium ring-1 transition",
                                state === "pinned" &&
                                    "bg-(--color-brand-600)/10 text-(--color-brand-700) ring-(--color-brand-600)/20 dark:text-(--color-brand-300) dark:ring-(--color-brand-400)/25",
                                state === "excluded" &&
                                    "text-zinc-500 line-through ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/15",
                                state === "neutral" &&
                                    "text-zinc-600 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/10",
                            )}
                        >
                            {state === "pinned" && <PlusCircleIcon className={"size-3.5"} />}
                            {state === "excluded" && <MinusCircleIcon className={"size-3.5"} />}
                            {theme.label}
                            {!undetected && (
                                <span className={"tabular-nums opacity-60"}>{Math.round(theme.share * 100)}%</span>
                            )}
                            {undetected && <span className={"opacity-60"}>{t("label.theme-undetected")}</span>}
                        </button>
                    );
                })}
            </div>
            <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.themes-cycle")}</p>
        </div>
    );
}
