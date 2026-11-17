import clsx from "clsx";
import { Text } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatingAnswers } from "src/api/generated";
import { ManaCost } from "src/components/mana-cost";
import { PrimaryButton } from "src/components/primary-button";
import { COLORS } from "src/utils/dating";
import type { Color } from "src/utils/dating";

/** The budgets offered, in euro per deck */
const BUDGETS = [75, 150, 300, 600, 1200];

/** The brackets offered */
const BRACKETS = [1, 2, 3, 4, 5];

/** A pill that toggles */
const PILL =
    "min-h-11 rounded-full px-4 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500";

/** A pill that is on */
const ON = "bg-lime-400 text-lime-950 ring-lime-500";

/** A pill that is off */
const OFF = "bg-white text-zinc-800 ring-zinc-950/10 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/15";

/**
 * The properties for {@link DatingProfileForm}
 */
export type DatingProfileFormProps = {
    /** The answers so far */
    answers: DatingAnswers | null | undefined;
    /** Store the answers */
    onSave: (answers: DatingAnswers) => Promise<void>;
};

/**
 * The three dating-profile questions: colors, bracket and budget.
 *
 * @returns the form
 */
export function DatingProfileForm({ answers, onSave }: DatingProfileFormProps) {
    const [t] = useTranslation("dating");
    const [colors, setColors] = useState<Set<Color>>(
        () => new Set([...(answers?.colors ?? "")].filter((c): c is Color => COLORS.includes(c as Color))),
    );
    const [bracket, setBracket] = useState<number | null>(answers?.bracket ?? null);
    const [budget, setBudget] = useState<number | null>(answers?.budget_eur ?? null);
    const [saving, setSaving] = useState(false);

    const toggle = (color: Color) =>
        setColors((current) => {
            const next = new Set(current);
            if (next.has(color)) next.delete(color);
            else next.add(color);
            return next;
        });

    return (
        <form
            className={"flex flex-col gap-6"}
            onSubmit={async (event) => {
                event.preventDefault();
                setSaving(true);
                try {
                    await onSave({
                        colors: COLORS.filter((color) => colors.has(color)).join(""),
                        bracket,
                        budget_eur: budget,
                    });
                } finally {
                    setSaving(false);
                }
            }}
        >
            <fieldset className={"flex flex-col gap-2"}>
                <legend className={"mb-2"}>
                    <Text className={"font-semibold"}>{t("label.colors")}</Text>
                </legend>
                <div className={"flex flex-wrap gap-2"}>
                    {COLORS.map((color) => (
                        <button
                            key={color}
                            type={"button"}
                            aria-pressed={colors.has(color)}
                            onClick={() => toggle(color)}
                            className={clsx(
                                PILL,
                                "flex size-11 items-center justify-center px-0",
                                colors.has(color) ? ON : OFF,
                            )}
                        >
                            <ManaCost value={`{${color}}`} symbolClassName={"size-6"} />
                        </button>
                    ))}
                </div>
            </fieldset>

            <fieldset className={"flex flex-col gap-2"}>
                <legend className={"mb-2"}>
                    <Text className={"font-semibold"}>{t("label.bracket")}</Text>
                </legend>
                <div className={"flex flex-wrap gap-2"}>
                    {BRACKETS.map((value) => (
                        <button
                            key={value}
                            type={"button"}
                            aria-pressed={bracket === value}
                            onClick={() => setBracket(bracket === value ? null : value)}
                            className={clsx(PILL, "w-11 px-0", bracket === value ? ON : OFF)}
                        >
                            {value}
                        </button>
                    ))}
                    <button
                        type={"button"}
                        aria-pressed={bracket === null}
                        onClick={() => setBracket(null)}
                        className={clsx(PILL, bracket === null ? ON : OFF)}
                    >
                        {t("label.no-bracket")}
                    </button>
                </div>
            </fieldset>

            <fieldset className={"flex flex-col gap-2"}>
                <legend className={"mb-2"}>
                    <Text className={"font-semibold"}>{t("label.budget")}</Text>
                </legend>
                <div className={"flex flex-wrap gap-2"}>
                    {BUDGETS.map((value) => (
                        <button
                            key={value}
                            type={"button"}
                            aria-pressed={budget === value}
                            onClick={() => setBudget(budget === value ? null : value)}
                            className={clsx(PILL, budget === value ? ON : OFF)}
                        >
                            {t("label.budget-eur", { value })}
                        </button>
                    ))}
                    <button
                        type={"button"}
                        aria-pressed={budget === null}
                        onClick={() => setBudget(null)}
                        className={clsx(PILL, budget === null ? ON : OFF)}
                    >
                        {t("label.any-budget")}
                    </button>
                </div>
            </fieldset>

            <div>
                <PrimaryButton type={"submit"} disabled={saving}>
                    {t("button.save")}
                </PrimaryButton>
            </div>
        </form>
    );
}
