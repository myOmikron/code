import { PlusIcon, QuestionMarkCircleIcon } from "@heroicons/react/20/solid";
import { Button, Text } from "components";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Diagnostics } from "src/api/graph-generated";
import { DeckThemeAddDialog } from "src/components/deck-theme-add-dialog";
import { QuietButton } from "src/components/quiet-button";
import { DeckAdvisorPanel, PANEL_GRID } from "src/components/deck-advisor-panel";
import { RowResetLine } from "src/components/row-reset-line";
import { THEME_LEVELS, ThemeLevel, ThemePrefs, themeTargetCards } from "src/utils/deck-theme-prefs";
import { ThemeRow, themeListing } from "src/utils/deck-theme-read";

/**
 * The properties for {@link DeckAdvisorThemes}
 */
export type DeckAdvisorThemesProps = {
    /** The report the themes were detected in */
    report: Diagnostics;
    /** What the advisor is currently told to favour and avoid */
    prefs: ThemePrefs;
    /** Sets how much of one theme the deck should hold, or clears the opinion */
    onSetLevel: (themeId: string, level: ThemeLevel | null) => void;
    /**
     * Display names for themes the deck does not read as, by id.
     *
     * A row for a theme the report has forgotten has no label to take, and
     * the id is a poor stand-in — "vehicles" where every other row says
     * "Vehicles". Whatever the caller knows is used; the id remains the
     * fallback.
     */
    labels?: Record<string, string>;
};

/**
 * What the deck reads as — and how much of each theme the reader wants.
 *
 * A row per theme: the cards the deck holds as a bar, and a four-step level.
 * Above the deck the level argues for the theme, below it trims, at zero it
 * steers away. Only themes the deck is behind get a row, plus any the reader
 * set a level for; the faint rest go to a footnote.
 *
 * @returns the panel
 */
export function DeckAdvisorThemes({ report, prefs, onSetLevel, labels }: DeckAdvisorThemesProps) {
    const [t] = useTranslation("advisor");
    const [adding, setAdding] = useState(false);
    const [showFaint, setShowFaint] = useState(false);

    const { levels } = prefs;
    const listing = themeListing(report, prefs, labels);
    const rows = showFaint ? [...listing.listed, ...listing.faint] : listing.listed;
    const detected: Record<string, number> = Object.fromEntries(
        (report.themes ?? []).map((theme) => [theme.theme, theme.cards ?? 0]),
    );

    // One scale for every row, so the bars compare across themes: the
    // largest count or target in view, or a good share of the spells so a
    // deck with one small theme does not draw it wall to wall.
    const targets = rows.map((row) => {
        const level = levels[row.id];
        return level === undefined ? 0 : themeTargetCards(level, listing.spells);
    });
    const scale = Math.max(10, Math.ceil(Math.max(...rows.map((row) => row.cards), ...targets, listing.spells * 0.45)));

    return (
        <>
            <DeckAdvisorPanel
                hint={t("description.themes")}
                action={
                    <QuietButton onClick={() => setAdding(true)} className={"shrink-0"}>
                        <PlusIcon className={"size-3.5"} />
                        {t("button.add-theme")}
                    </QuietButton>
                }
            >
                {rows.length === 0 ? (
                    <NoRead onAdd={() => setAdding(true)} />
                ) : (
                    <div className={PANEL_GRID}>
                        {rows.map((row) => (
                            <Row
                                key={row.id}
                                row={row}
                                level={levels[row.id] ?? null}
                                spells={listing.spells}
                                scale={scale}
                                onSetLevel={(level) => onSetLevel(row.id, level)}
                            />
                        ))}
                    </div>
                )}

                <div className={"mt-4 flex flex-col gap-1 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                    {listing.spells > 0 && (
                        <span>
                            {t("description.theme-evidence", { themed: listing.themed, spells: listing.spells })}
                        </span>
                    )}
                    {/* The themes a few cards brush past, named but not
                        listed: hiding them entirely would trade one wrong
                        impression for another, and a reader who wants one
                        can still bring it up. */}
                    {listing.faint.length > 0 && (
                        <span className={"flex flex-wrap items-baseline gap-x-2 text-zinc-400 dark:text-zinc-500"}>
                            <span>
                                {t("label.theme-faint", {
                                    themes: listing.faint.map((row) => `${row.label} ${row.cards}`).join(" · "),
                                })}
                            </span>
                            <QuietButton onClick={() => setShowFaint((shown) => !shown)} className={"-my-0.5"}>
                                {showFaint ? t("button.hide-faint") : t("button.show-faint")}
                            </QuietButton>
                        </span>
                    )}
                </div>
            </DeckAdvisorPanel>

            <DeckThemeAddDialog
                open={adding}
                onClose={() => setAdding(false)}
                detected={detected}
                listed={listing.listed.map((row) => row.id)}
                onAdd={(theme) => onSetLevel(theme, "core")}
            />
        </>
    );
}

/** The properties for {@link Row} */
type RowProps = {
    /** The theme */
    row: ThemeRow;
    /** Its level, or nothing said yet */
    level: ThemeLevel | null;
    /** The deck's non-land count, which the level is a share of */
    spells: number;
    /** The top of every bar on the panel, in cards */
    scale: number;
    /** Sets the level, or clears it */
    onSetLevel: (level: ThemeLevel | null) => void;
};

/**
 * One theme: what the deck holds, and how much the reader wants.
 *
 * The bar is the fact — grey while nothing has been said about the theme.
 * Once a level is set the bar is read against it: amber and short of a
 * target the advisor argues for, green up to a target the deck meets with
 * the surplus hatched behind it for the cut side to take, and hatched
 * entirely for a theme steered away from. The line under the control says
 * the same in words, and only appears once there is something to say.
 *
 * @returns the row
 */
function Row({ row, level, spells, scale, onSetLevel }: RowProps) {
    const [t] = useTranslation("advisor");
    const target = level === null ? null : themeTargetCards(level, spells);
    const percent = (value: number) => `${Math.min(100, Math.max(0, (value / scale) * 100))}%`;
    const away = level === "avoid";

    let verdict: string | null = null;
    if (target !== null) {
        if (away) verdict = t("description.theme-avoid");
        else if (target > row.cards) verdict = t("description.theme-argue-more", { count: target - row.cards });
        else if (target < row.cards) verdict = t("description.theme-trim", { count: row.cards - target });
        else verdict = t("description.theme-hold", { count: row.cards });
    } else if (!row.confident) {
        verdict = t("description.theme-faint-row");
    }

    return (
        <div className={"group flex flex-col gap-2"}>
            <div className={"flex items-baseline justify-between gap-x-3"}>
                <span
                    className={clsx(
                        "truncate text-sm/6 font-medium",
                        away
                            ? "text-zinc-500 line-through decoration-zinc-950/25 dark:text-zinc-400 dark:decoration-white/25"
                            : row.confident || level !== null
                              ? "text-zinc-950 dark:text-white"
                              : "font-normal text-zinc-500 dark:text-zinc-400",
                    )}
                >
                    {row.label}
                </span>
                {/* The deck's number in the page's voice, the target quietly
                    behind it: one is a fact, the other an intention. */}
                <span className={"flex shrink-0 items-baseline gap-1.5 text-xs/5 tabular-nums"}>
                    <span className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{row.cards}</span>
                    {target === null ? (
                        <span className={"text-zinc-400 dark:text-zinc-500"}>
                            {t("label.theme-of-total", { spells })}
                        </span>
                    ) : (
                        <span
                            className={"font-medium text-(--color-brand-700) dark:text-(--color-brand-300)"}
                            aria-label={t("accessibility.theme-target", { count: target })}
                        >
                            → {target}
                        </span>
                    )}
                </span>
            </div>

            {/* The bar, and the three level marks along it. */}
            <div className={"relative h-3"} aria-hidden={"true"}>
                <div
                    className={
                        "absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"
                    }
                >
                    {target === null ? (
                        <div
                            className={"absolute inset-y-0 left-0 rounded-full bg-zinc-400/70 dark:bg-zinc-500/70"}
                            style={{ width: percent(row.cards) }}
                        />
                    ) : target > row.cards ? (
                        <div
                            className={"absolute inset-y-0 left-0 rounded-full bg-(--color-warning)"}
                            style={{ width: percent(row.cards) }}
                        />
                    ) : (
                        <>
                            <div
                                className={"absolute inset-y-0 left-0 rounded-full bg-(--color-success)"}
                                style={{ width: percent(target) }}
                            />
                            {row.cards > target && (
                                <div
                                    className={
                                        "absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(9_9_11/0.18)_0_2px,transparent_2px_6px)] dark:bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.22)_0_2px,transparent_2px_6px)]"
                                    }
                                    style={{
                                        left: percent(target),
                                        width: `calc(${percent(row.cards)} - ${percent(target)})`,
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>
                {THEME_LEVELS.filter((step) => step !== "avoid").map((step) => (
                    <div
                        key={step}
                        className={"absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-zinc-950/25 dark:bg-white/25"}
                        style={{ left: percent(themeTargetCards(step, spells)) }}
                    />
                ))}
            </div>

            <div
                role={"group"}
                aria-label={t("accessibility.theme-level", { name: row.label })}
                className={"grid grid-cols-4 gap-0.5 rounded-(--radius-pill) bg-zinc-950/5 p-0.5 dark:bg-white/10"}
            >
                {THEME_LEVELS.map((step) => {
                    const pressed = level === step;
                    return (
                        <button
                            key={step}
                            type={"button"}
                            aria-pressed={pressed}
                            title={t("label.theme-level-cards", {
                                level: t(`label.theme-level-${step}`),
                                count: themeTargetCards(step, spells),
                            })}
                            // A second tap on the level already set clears
                            // the opinion — the only path back to neutral.
                            onClick={() => onSetLevel(pressed ? null : step)}
                            className={clsx(
                                "min-w-0 truncate rounded-(--radius-pill) px-1 py-0.5 text-xs/5 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-accent)",
                                pressed
                                    ? clsx(
                                          "bg-(--surface-card) shadow-(--shadow-card-sm)",
                                          step === "avoid"
                                              ? "text-zinc-700 dark:text-zinc-200"
                                              : "text-(--color-brand-700) dark:text-(--color-brand-300)",
                                      )
                                    : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                            )}
                        >
                            {t(`label.theme-level-${step}`)}
                        </button>
                    );
                })}
            </div>

            {/* One line under the control carries both the verdict and the
                way back — and is left out entirely where it would carry
                neither. */}
            {(verdict !== null || level !== null) && (
                <RowResetLine
                    verdict={verdict ?? ""}
                    onReset={level !== null ? () => onSetLevel(null) : undefined}
                    resetLabel={t("accessibility.theme-reset", { name: row.label })}
                />
            )}
        </div>
    );
}

/** The properties for {@link NoRead} */
type NoReadProps = {
    /** Opens the picker, so the user can say what the deck plays */
    onAdd: () => void;
};

/**
 * What the panel says when the deck does not read as anything in particular.
 *
 * The way out is the user telling the advisor what they are building, because
 * on a half-built deck they are the only one who knows.
 *
 * @returns the placeholder
 */
function NoRead({ onAdd }: NoReadProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"flex h-40 items-center justify-center sm:h-44"}>
            <div className={"flex max-w-xs flex-col items-center gap-2 text-center"}>
                <QuestionMarkCircleIcon className={"size-6 text-zinc-400 dark:text-zinc-500"} aria-hidden={"true"} />
                <p className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.no-theme-read")}</p>
                <Text className={"text-xs/5!"}>{t("description.no-theme-read")}</Text>
                <Button outline onClick={onAdd} className={"mt-1"}>
                    {t("button.add-theme")}
                </Button>
            </div>
        </div>
    );
}
