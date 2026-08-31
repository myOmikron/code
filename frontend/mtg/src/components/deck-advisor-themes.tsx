import { MinusCircleIcon, PlusCircleIcon, QuestionMarkCircleIcon } from "@heroicons/react/20/solid";
import { Button, Text } from "components";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "recharts";
import { Diagnostics } from "src/api/graph-generated";
import { ChartPanel } from "src/components/charts/chart-card";
import { ProfileRadar } from "src/components/charts/profile-radar";
import { DeckThemeDialog } from "src/components/deck-theme-dialog";
import { QuietButton } from "src/components/quiet-button";
import { ThemeAxis, themeRead } from "src/utils/deck-theme-read";
import { ThemePrefs, themeState } from "src/utils/deck-theme-prefs";

/** Below this a theme is a card or two brushing past, not something to offer a chip for */
const CHIP_FLOOR = 2;

/** How many chips are offered before the list stops being a list */
const CHIP_LIMIT = 10;

/**
 * How much of a theme name the radar's own labels can hold.
 *
 * The panel is a third of the cockpit and the labels hang outside the shape,
 * so there are about sixty pixels either side of it. Theme names run to
 * "Treasure & ritual mana", which is not a label that fits anywhere in this
 * column — and a name sliced off by the edge of the chart reads as a bug,
 * where one that ends in an ellipsis reads as a name that is too long. The
 * caption under the chart says it in full on hover, and so does the chip.
 */
const AXIS_CHARS = 13;

/**
 * Shortens a theme name to what the radar can draw
 *
 * @param label the theme's full name
 *
 * @returns the name, cut to {@link AXIS_CHARS} with an ellipsis where it had
 *   to be
 */
function axisLabel(label: string): string {
    return label.length > AXIS_CHARS ? `${label.slice(0, AXIS_CHARS - 1).trimEnd()}…` : label;
}

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
    /** Records the themes the deck is played for, replacing the pinned set */
    onDefine: (themes: Array<string>) => void;
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
 * What the deck reads as — and how much of the deck is behind that reading.
 *
 * The service's theme profile is a distribution: seven cards can carry a 34%
 * share and be the deck's strongest theme, which drawn as a radar reads as
 * "this deck is Vehicles" in a shape nobody can argue with. So the numbers
 * here are card counts, the ordering is by card counts, and a deck whose
 * strongest theme rests on a handful of cards is told that no obvious theme
 * was found rather than handed a confident polygon. Overconfidence is the one
 * failure a diagnosis cannot recover from: it is wrong and it looks certain.
 *
 * The way out of that state is the same control as the way to disagree with a
 * confident one — the user says what the deck plays, and the advisor argues
 * for it from there.
 *
 * A panel of its own rather than a body handed to one: it sits in the refine
 * cockpit beside the curve and the corridors, and the chips are steering, not
 * diagnosis, so they belong to this panel's header and rail rather than to
 * whatever renders it.
 *
 * @returns the panel
 */
export function DeckAdvisorThemes({ report, prefs, onCycle, onDefine, labels }: DeckAdvisorThemesProps) {
    const [t] = useTranslation("advisor");
    const [defining, setDefining] = useState(false);

    const read = themeRead(report);
    const detected: Record<string, number> = Object.fromEntries(
        (report.themes ?? []).map((theme) => [theme.theme, theme.cards ?? 0]),
    );

    const offered = (report.themes ?? [])
        .map((theme) => ({ theme: theme.theme, label: theme.label, cards: theme.cards ?? 0 }))
        .filter((theme) => theme.cards >= CHIP_FLOOR)
        .slice(0, CHIP_LIMIT);
    const known = new Set(offered.map((theme) => theme.theme));
    // Opinions the profile no longer supports, kept reachable: an excluded
    // theme that vanished from the report would otherwise be impossible to
    // un-exclude, because the chip is the only control for it.
    const orphaned = [...prefs.pinned, ...prefs.excluded]
        .filter((id) => !known.has(id))
        .map((id) => ({ theme: id, label: labels?.[id] ?? id.replace(/_/g, " "), cards: 0 }));
    const chips = [...offered, ...orphaned];

    // The chips stand in a rail beside the shape, which is what makes a third
    // of the cockpit enough for both. Only beside a *shape*: the rows and the
    // no-read placeholder are as wide as the panel on their own, and squeezed
    // next to a rail they read as a broken chart rather than a narrow one.
    const rail = read.shape && chips.length > 0;

    return (
        <>
            <ChartPanel
                title={t("heading.themes")}
                hint={
                    read.spells > 0
                        ? t("description.theme-evidence", { themed: read.themed, spells: read.spells })
                        : t("description.themes")
                }
                minHeight={240}
                action={
                    read.level !== "none" && (
                        <QuietButton onClick={() => setDefining(true)} className={"shrink-0"}>
                            {t("button.define-themes")}
                        </QuietButton>
                    )
                }
            >
                <div className={clsx("grid gap-3", rail && "grid-cols-[minmax(0,1fr)_7rem] items-center")}>
                    {read.level === "none" ? (
                        <NoRead axes={read.axes} onDefine={() => setDefining(true)} />
                    ) : read.shape ? (
                        <Shape axes={read.axes} spells={read.spells} />
                    ) : (
                        <Rows axes={read.axes} />
                    )}

                    {chips.length > 0 && (
                        <div className={clsx("flex gap-1", rail ? "flex-col" : "flex-wrap")}>
                            {chips.map((theme) => {
                                const state = themeState(prefs, theme.theme);
                                return (
                                    <button
                                        key={theme.theme}
                                        type={"button"}
                                        onClick={() => onCycle(theme.theme)}
                                        aria-pressed={state !== "neutral"}
                                        title={t(`accessibility.theme-${state}`, { name: theme.label })}
                                        className={clsx(
                                            "flex items-center justify-between gap-1 rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium ring-1 transition",
                                            state === "pinned" &&
                                                "bg-(--color-brand-600)/10 text-(--color-brand-700) ring-(--color-brand-600)/20 dark:text-(--color-brand-300) dark:ring-(--color-brand-400)/25",
                                            state === "excluded" &&
                                                "text-zinc-500 line-through ring-zinc-950/10 dark:text-zinc-400 dark:ring-white/15",
                                            state === "neutral" &&
                                                "text-zinc-600 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/10",
                                        )}
                                    >
                                        <span className={"flex min-w-0 items-center gap-1"}>
                                            {state === "pinned" && <PlusCircleIcon className={"size-3.5 shrink-0"} />}
                                            {state === "excluded" && (
                                                <MinusCircleIcon className={"size-3.5 shrink-0"} />
                                            )}
                                            {/* Truncating rather than wrapping: in the
                                                rail a long theme name would otherwise
                                                make one chip twice the height of the
                                                rest. The title says it in full. */}
                                            <span className={"truncate"}>{theme.label}</span>
                                        </span>
                                        <span className={"tabular-nums opacity-60"}>
                                            {theme.cards > 0 ? theme.cards : t("label.theme-undetected")}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {read.level === "weak" && (
                    <p className={"mt-3 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.theme-thin", { count: read.axes[0].cards })}
                    </p>
                )}
            </ChartPanel>

            {/* Outside the panel: its body waits until it is near the
                viewport before drawing, and a dialog that only exists once
                the chart under it has been drawn is a trap for whoever moves
                this next. */}
            <DeckThemeDialog
                open={defining}
                onClose={() => setDefining(false)}
                pinned={prefs.pinned}
                detected={detected}
                onSave={onDefine}
            />
        </>
    );
}

/** The properties for {@link Shape} */
type ShapeProps = {
    /** The themes to draw, strongest first */
    axes: Array<ThemeAxis>;
    /** The deck's non-land count, which the tooltip counts against */
    spells: number;
};

/**
 * The theme profile as a shape, drawn from the cards behind each theme.
 *
 * The radius is read against the strongest theme's *card count*, so the
 * outermost point is "the theme most of this deck is", not "100% of a
 * distribution" — and the tooltip says how many cards out of how many spells,
 * which is the number a reader can go and check.
 *
 * @returns the chart
 */
function Shape({ axes, spells }: ShapeProps) {
    const [t] = useTranslation("advisor");
    const peak = Math.max(...axes.map((axis) => axis.cards));
    // The chart is handed shortened labels, so what comes back from a hover
    // is one too. Mapped back here rather than compared loosely below: the
    // caption is keyed on the name the service gave.
    const named = new Map(axes.map((axis) => [axisLabel(axis.label), axis.label]));

    // The label itself, not an id — theme labels come from the service
    // untranslated, so the label already is the stable key here.
    const [explained, setExplained] = useState<string | null>(null);

    return (
        <div className={"min-w-0"}>
            <div className={"h-40 max-h-[45dvh] text-zinc-400 sm:h-44 dark:text-zinc-500"}>
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    <ProfileRadar
                        data={axes.map((axis) => ({ label: axisLabel(axis.label), value: axis.cards }))}
                        domain={[0, peak]}
                        // The labels hang outside the polygon and the names are
                        // long, so the shape gets under half the box and they
                        // get the rest. At 75% every side label was sliced off
                        // by the edge of the chart.
                        radius={"45%"}
                        tickSize={10}
                        format={(value) => t("label.theme-of-spells", { cards: Math.round(value), spells })}
                        onAxisHover={(label) => {
                            const full = label === null ? null : (named.get(label) ?? label);
                            // A second tap on the axis already explained closes it again —
                            // the only path that needs the toggle, since leaving the mouse
                            // always reports `null`.
                            setExplained((current) => (full !== null && current === full ? null : full));
                        }}
                    />
                </ResponsiveContainer>
            </div>
            {/* Held open at the height of its tallest line, the same way the
                card dialog's axis notes are: a caption that appears on hover
                and vanishes on leave moves whatever sits under it. */}
            <div className={"mt-1 grid text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                {axes.map((axis) => (
                    <p
                        key={axis.label}
                        aria-hidden={axis.label !== explained}
                        className={clsx("col-start-1 row-start-1", axis.label === explained ? "visible" : "invisible")}
                    >
                        {t("description.theme-axis", { name: axis.label, cards: axis.cards, spells })}
                    </p>
                ))}
            </div>
        </div>
    );
}

/** The properties for {@link Rows} */
type RowsProps = {
    /** The themes to list, strongest first */
    axes: Array<ThemeAxis>;
};

/**
 * The same reading as bars, for a deck with too few themes to make a shape
 *
 * @returns the rows
 */
function Rows({ axes }: RowsProps) {
    const [t] = useTranslation("advisor");
    const peak = Math.max(...axes.map((axis) => axis.cards));

    return (
        <div className={"flex flex-col gap-2 py-2"}>
            {axes.map((axis) => (
                <div key={axis.id} className={"flex items-center gap-3"}>
                    <span className={"w-32 shrink-0 truncate text-sm/6 text-zinc-950 dark:text-white"}>
                        {axis.label}
                    </span>
                    <span className={"h-2 flex-1 overflow-hidden rounded-full bg-zinc-950/5 dark:bg-white/10"}>
                        <span
                            className={"block h-full rounded-full bg-(--color-accent)"}
                            style={{ width: `${(axis.cards / peak) * 100}%` }}
                        />
                    </span>
                    <span
                        className={"w-20 shrink-0 text-right text-xs/5 text-zinc-500 tabular-nums dark:text-zinc-400"}
                    >
                        {t("label.theme-cards", { count: axis.cards })}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** The properties for {@link NoRead} */
type NoReadProps = {
    /** Whatever was detected, drawn greyed out behind the message */
    axes: Array<ThemeAxis>;
    /** Opens the picker, so the user can say what the deck plays */
    onDefine: () => void;
};

/**
 * What the panel says when the deck does not read as anything in particular.
 *
 * The shape stays on screen, greyed and inert, rather than disappearing: what
 * little was detected is still the truth about the list, and hiding it would
 * trade one wrong impression for another. The overlay says what is missing and
 * offers the way out — which is the user telling the advisor what they are
 * building, because on a half-built deck they are the only one who knows.
 *
 * @returns the placeholder
 */
function NoRead({ axes, onDefine }: NoReadProps) {
    const [t] = useTranslation("advisor");
    const peak = Math.max(1, ...axes.map((axis) => axis.cards));

    return (
        <div className={"relative flex h-40 max-h-[45dvh] items-center justify-center sm:h-44"}>
            {axes.length >= 3 && (
                <div
                    className={"absolute inset-0 text-zinc-300 opacity-40 grayscale dark:text-zinc-700"}
                    aria-hidden={"true"}
                >
                    <ResponsiveContainer width={"100%"} height={"100%"}>
                        <ProfileRadar
                            data={axes.map((axis) => ({ label: axisLabel(axis.label), value: axis.cards }))}
                            domain={[0, peak]}
                            radius={"45%"}
                            tickSize={10}
                            stroke={"currentColor"}
                        />
                    </ResponsiveContainer>
                </div>
            )}
            <div className={"relative flex max-w-xs flex-col items-center gap-2 text-center"}>
                <QuestionMarkCircleIcon className={"size-6 text-zinc-400 dark:text-zinc-500"} aria-hidden={"true"} />
                <p className={"text-sm/6 font-medium text-zinc-950 dark:text-white"}>{t("heading.no-theme-read")}</p>
                <Text className={"text-xs/5!"}>{t("description.no-theme-read")}</Text>
                <Button outline onClick={onDefine} className={"mt-1"}>
                    {t("button.define-themes")}
                </Button>
            </div>
        </div>
    );
}
