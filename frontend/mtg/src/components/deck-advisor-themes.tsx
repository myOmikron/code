import { MinusCircleIcon, PlusCircleIcon, QuestionMarkCircleIcon } from "@heroicons/react/20/solid";
import { Button, Text } from "components";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "recharts";
import { Diagnostics } from "src/api/graph-generated";
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
 * @returns the panel body
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

    return (
        <div className={"mt-4 grid items-center gap-6 lg:grid-cols-2"}>
            {read.level === "none" ? (
                <NoRead axes={read.axes} onDefine={() => setDefining(true)} />
            ) : read.shape ? (
                <Shape axes={read.axes} spells={read.spells} />
            ) : (
                <Rows axes={read.axes} />
            )}

            <div className={"flex flex-col"}>
                {/* The count first, and in the panel's own voice: every number
                    beside it is a slice of this one. */}
                <p className={"text-sm/6 text-zinc-950 dark:text-white"}>
                    {read.spells > 0
                        ? t("description.theme-evidence", { themed: read.themed, spells: read.spells })
                        : t("description.themes")}
                </p>
                {read.level === "weak" && (
                    <p className={"mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                        {t("description.theme-thin", { count: read.axes[0].cards })}
                    </p>
                )}

                {chips.length > 0 && (
                    <div className={"mt-4 flex flex-wrap gap-1"}>
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
                                    <span className={"tabular-nums opacity-60"}>
                                        {theme.cards > 0 ? theme.cards : t("label.theme-undetected")}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className={"mt-3 flex flex-wrap items-center justify-between gap-2"}>
                    <p className={"text-xs/5 text-zinc-500 dark:text-zinc-400"}>{t("description.themes-cycle")}</p>
                    {read.level !== "none" && (
                        <QuietButton onClick={() => setDefining(true)}>{t("button.define-themes")}</QuietButton>
                    )}
                </div>
            </div>

            <DeckThemeDialog
                open={defining}
                onClose={() => setDefining(false)}
                pinned={prefs.pinned}
                detected={detected}
                onSave={onDefine}
            />
        </div>
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

    // The label itself, not an id — theme labels come from the service
    // untranslated, so the label already is the stable key here.
    const [explained, setExplained] = useState<string | null>(null);

    return (
        <div>
            <div className={"h-40 max-h-[45dvh] text-zinc-400 sm:h-60 dark:text-zinc-500"}>
                <ResponsiveContainer width={"100%"} height={"100%"}>
                    <ProfileRadar
                        data={axes.map((axis) => ({ label: axis.label, value: axis.cards }))}
                        domain={[0, peak]}
                        format={(value) => t("label.theme-of-spells", { cards: Math.round(value), spells })}
                        onAxisHover={(label) => {
                            // A second tap on the axis already explained closes it again —
                            // the only path that needs the toggle, since leaving the mouse
                            // always reports `null`.
                            setExplained((current) => (label !== null && current === label ? null : label));
                        }}
                    />
                </ResponsiveContainer>
            </div>
            {explained !== null &&
                (() => {
                    const axis = axes.find((held) => held.label === explained);
                    return axis === undefined ? null : (
                        <p className={"mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                            {t("description.theme-axis", { name: axis.label, cards: axis.cards, spells })}
                        </p>
                    );
                })()}
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
        <div className={"relative mt-2 flex h-40 max-h-[45dvh] items-center justify-center sm:h-60"}>
            {axes.length >= 3 && (
                <div
                    className={"absolute inset-0 text-zinc-300 opacity-40 grayscale dark:text-zinc-700"}
                    aria-hidden={"true"}
                >
                    <ResponsiveContainer width={"100%"} height={"100%"}>
                        <ProfileRadar
                            data={axes.map((axis) => ({ label: axis.label, value: axis.cards }))}
                            domain={[0, peak]}
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
