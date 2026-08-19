import { useTranslation } from "react-i18next";
import { BracketRulesResponse } from "src/api/generated";
import { useDeckLabels } from "src/components/deck-labels";

/**
 * The properties for {@link DeckAdvisorSpeed}
 */
export type DeckAdvisorSpeedProps = {
    /** The speed the analysis currently runs at, 0 to 1 */
    speed: number;
    /** Whether the speed departs from what the deck's bracket implies */
    overridden: boolean;
    /** The brackets on offer, for naming the equivalent one */
    brackets: Array<BracketRulesResponse>;
    /** Records a new speed */
    onChange: (speed: number) => void;
    /** Hands the decision back to the deck's bracket */
    onReset: () => void;
};

/**
 * The analysis-speed slider, melding the advisor's continuous scale with the
 * deck's brackets.
 *
 * The deck's claimed bracket stays the deck's own statement and sets the
 * default; this slider only tunes what the *analysis* holds the deck to.
 * The readout names the nearest bracket, so the scale stays anchored in the
 * vocabulary the rest of the app speaks.
 *
 * @returns the control
 */
export function DeckAdvisorSpeed({ speed, overridden, brackets, onChange, onReset }: DeckAdvisorSpeedProps) {
    const [t] = useTranslation("advisor");
    const labels = useDeckLabels();

    const nearest = Math.round(speed * 4) + 1;
    const bracket = brackets.find((entry) => entry.number === nearest);

    return (
        <div className={"flex items-center gap-3"} title={t("description.speed")}>
            <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>{t("label.speed")}</span>
            <input
                type={"range"}
                min={0}
                max={1}
                step={0.05}
                value={speed}
                aria-label={t("accessibility.speed-slider")}
                onChange={(event) => onChange(Number(event.target.value))}
                className={"w-36 accent-(--color-accent)"}
            />
            <span className={"text-xs whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400"}>
                {bracket !== undefined
                    ? t("label.speed-as-bracket", { number: bracket.number, name: labels.bracket(bracket.slug) })
                    : speed.toFixed(2)}
            </span>
            {overridden && (
                <button
                    type={"button"}
                    onClick={onReset}
                    className={
                        "rounded-(--radius-pill) px-2 py-0.5 text-xs font-medium text-zinc-500 ring-1 ring-zinc-950/10 transition hover:bg-zinc-950/5 dark:text-zinc-400 dark:ring-white/15 dark:hover:bg-white/10"
                    }
                >
                    {t("button.speed-reset")}
                </button>
            )}
        </div>
    );
}
