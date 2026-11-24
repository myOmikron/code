import clsx from "clsx";
import { Subheading, notify } from "components";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { DatingAnswers, DatingProfileResponse } from "src/api/generated";
import { ManaCost } from "src/components/mana-cost";
import { COLORS, manaSymbols } from "src/utils/dating";
import type { Color } from "src/utils/dating";
import { formatCurrency } from "src/utils/format";

/** The budgets offered, in euro per deck */
const BUDGETS = [75, 150, 300, 600, 1200];

/** The brackets offered */
const BRACKETS = [1, 2, 3, 4, 5];

/** The salt levels offered, on EDHREC's scale */
const SALTS = [
    { value: 0.5, key: "label.salt-mild" },
    { value: 1, key: "label.salt-medium" },
    { value: 1.5, key: "label.salt-spicy" },
    { value: 2, key: "label.salt-salty" },
] as const;

/** A pill that toggles */
const PILL =
    "min-h-11 rounded-full px-4 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500 disabled:opacity-50";

/** A pill that is on */
const ON = "bg-lime-400 text-lime-950 ring-lime-500";

/** A pill that is off */
const OFF =
    "bg-white text-zinc-800 ring-zinc-950/10 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/15 dark:hover:bg-zinc-800";

/** One of the editable preferences */
type Preference = "colors" | "bracket" | "budget" | "salt";

/**
 * The properties for {@link DatingPreferences}
 */
export type DatingPreferencesProps = {
    /** The profile as Commanders see it */
    profile: DatingProfileResponse;
    /** The profile after a saved change */
    onChange: (profile: DatingProfileResponse) => void;
    /** Whether to list the themes too */
    themes?: boolean;
};

/**
 * The saved preferences: a tile per dimension that opens its choices, and the themes to say no to.
 * A choice wins over what the decks say until it is reset.
 *
 * @returns the tiles and their editor
 */
export function DatingPreferences({ profile, onChange, themes = false }: DatingPreferencesProps) {
    const [t] = useTranslation("dating");
    const [open, setOpen] = useState<Preference | null>(null);
    const [saving, setSaving] = useState(false);
    const answers: DatingAnswers = profile.answers ?? { colors: "", bracket: null, budget_eur: null };
    const chosen = new Set([...answers.colors].filter((c): c is Color => COLORS.includes(c as Color)));
    const avoided = new Set(answers.avoided ?? []);
    // The server keeps salt in tenths
    const saltTenths = answers.salt == null ? null : Math.round(answers.salt * 10);

    const save = async (change: Partial<DatingAnswers>) => {
        setSaving(true);
        try {
            onChange(await Api.dating.answer({ ...answers, avoided: [...avoided], ...change }));
        } catch {
            notify.error(t("toast.profile-failed"));
        } finally {
            setSaving(false);
        }
    };

    const source = (answered: boolean) =>
        answered ? t("label.your-choice") : profile.decks > 0 ? t("label.from-decks") : t("label.not-set");

    const tiles: { key: Preference; label: string; value: ReactNode; answered: boolean }[] = [
        {
            key: "colors",
            label: t("label.colors"),
            value: profile.colors.length > 0 ? <ManaCost value={manaSymbols(profile.colors.join(""))} /> : "–",
            answered: chosen.size > 0,
        },
        {
            key: "bracket",
            label: t("label.bracket"),
            value: profile.bracket != null ? profile.bracket.toFixed(1) : "–",
            answered: answers.bracket != null,
        },
        {
            key: "budget",
            label: t("label.budget"),
            value: profile.budget_eur != null ? formatCurrency(profile.budget_eur) : "–",
            answered: answers.budget_eur != null,
        },
        {
            key: "salt",
            label: t("label.salt"),
            value: profile.salt != null ? profile.salt.toFixed(1) : "–",
            answered: answers.salt != null,
        },
    ];

    const reset = (answered: boolean, change: Partial<DatingAnswers>) => (
        <button
            type={"button"}
            disabled={saving}
            aria-pressed={!answered}
            onClick={() => save(change)}
            className={clsx(PILL, !answered ? ON : OFF)}
        >
            {profile.decks > 0 ? t("button.use-decks") : t("button.any")}
        </button>
    );

    return (
        <div className={"flex flex-col gap-4"}>
            <div className={"grid grid-cols-2 gap-2 sm:grid-cols-4"}>
                {tiles.map((tile) => (
                    <button
                        key={tile.key}
                        type={"button"}
                        aria-expanded={open === tile.key}
                        onClick={() => setOpen(open === tile.key ? null : tile.key)}
                        className={clsx(
                            "flex flex-col items-start gap-1 rounded-(--radius-control) p-3 text-left ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500",
                            open === tile.key
                                ? "bg-lime-400/15 ring-lime-500"
                                : "bg-zinc-100 ring-transparent hover:bg-zinc-200/70 dark:bg-zinc-800 dark:hover:bg-zinc-700/70",
                        )}
                    >
                        <span className={"text-xs text-zinc-500 dark:text-zinc-400"}>{tile.label}</span>
                        <span className={"font-bold text-zinc-950 dark:text-white"}>{tile.value}</span>
                        <span
                            className={clsx(
                                "text-xs",
                                tile.answered
                                    ? "font-semibold text-lime-700 dark:text-lime-400"
                                    : "text-zinc-500 dark:text-zinc-400",
                            )}
                        >
                            {source(tile.answered)}
                        </span>
                    </button>
                ))}
            </div>

            {open === "colors" && (
                <div className={"flex flex-wrap gap-2"}>
                    {COLORS.map((color) => (
                        <button
                            key={color}
                            type={"button"}
                            disabled={saving}
                            aria-pressed={chosen.has(color)}
                            aria-label={t(`accessibility.color-${color.toLowerCase()}`)}
                            onClick={() => {
                                const next = new Set(chosen);
                                if (next.has(color)) next.delete(color);
                                else next.add(color);
                                void save({ colors: COLORS.filter((c) => next.has(c)).join("") });
                            }}
                            className={clsx(
                                PILL,
                                "flex size-11 items-center justify-center px-0",
                                chosen.has(color) ? ON : OFF,
                            )}
                        >
                            <ManaCost value={`{${color}}`} symbolClassName={"size-6"} />
                        </button>
                    ))}
                    {reset(chosen.size > 0, { colors: "" })}
                </div>
            )}

            {open === "bracket" && (
                <div className={"flex flex-wrap gap-2"}>
                    {BRACKETS.map((value) => (
                        <button
                            key={value}
                            type={"button"}
                            disabled={saving}
                            aria-pressed={answers.bracket === value}
                            onClick={() => save({ bracket: value })}
                            className={clsx(PILL, "w-11 px-0", answers.bracket === value ? ON : OFF)}
                        >
                            {value}
                        </button>
                    ))}
                    {reset(answers.bracket != null, { bracket: null })}
                </div>
            )}

            {open === "budget" && (
                <div className={"flex flex-wrap gap-2"}>
                    {BUDGETS.map((value) => (
                        <button
                            key={value}
                            type={"button"}
                            disabled={saving}
                            aria-pressed={answers.budget_eur === value}
                            onClick={() => save({ budget_eur: value })}
                            className={clsx(PILL, answers.budget_eur === value ? ON : OFF)}
                        >
                            {t("label.budget-eur", { value })}
                        </button>
                    ))}
                    {reset(answers.budget_eur != null, { budget_eur: null })}
                </div>
            )}

            {open === "salt" && (
                <div className={"flex flex-wrap gap-2"}>
                    {SALTS.map((salt) => (
                        <button
                            key={salt.value}
                            type={"button"}
                            disabled={saving}
                            aria-pressed={saltTenths === salt.value * 10}
                            onClick={() => save({ salt: salt.value })}
                            className={clsx(PILL, saltTenths === salt.value * 10 ? ON : OFF)}
                        >
                            {t(salt.key)}
                        </button>
                    ))}
                    {reset(answers.salt != null, { salt: null })}
                </div>
            )}

            {themes && profile.themes.length > 0 && (
                <div className={"flex flex-col gap-2"}>
                    <Subheading>{t("heading.themes")}</Subheading>
                    <div className={"flex flex-wrap gap-1.5"}>
                        {profile.themes.map((theme) => (
                            <button
                                key={theme.theme}
                                type={"button"}
                                disabled={saving}
                                aria-pressed={theme.avoided}
                                aria-label={t(theme.avoided ? "accessibility.theme-avoided" : "accessibility.theme", {
                                    theme: theme.label,
                                })}
                                onClick={() => {
                                    const next = new Set(avoided);
                                    if (next.has(theme.theme)) next.delete(theme.theme);
                                    else next.add(theme.theme);
                                    void save({ avoided: [...next] });
                                }}
                                className={clsx(
                                    "min-h-9 rounded-full px-3 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500",
                                    theme.avoided
                                        ? "bg-transparent text-zinc-400 line-through ring-zinc-950/10 dark:text-zinc-500 dark:ring-white/10"
                                        : theme.strength >= 0.66
                                          ? "bg-lime-400/25 text-lime-900 ring-lime-500/60 hover:bg-lime-400/40 dark:text-lime-100"
                                          : "bg-zinc-100 text-zinc-700 ring-zinc-950/10 hover:bg-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-zinc-700/70",
                                )}
                            >
                                {theme.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
