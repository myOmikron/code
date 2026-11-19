import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import { COLORS } from "src/utils/dating";
import type { Color, ColorChoice } from "src/utils/dating";

/**
 * The properties for {@link DatingColorFilter}
 */
export type DatingColorFilterProps = {
    /** The choice per color; a missing color is allowed */
    choices: ReadonlyMap<Color, ColorChoice>;
    /** Move one color to its next choice */
    onToggle: (color: Color) => void;
};

/**
 * Five mana symbols, all allowed at first. A tap excludes a color, a second one requires it.
 *
 * @returns the filter
 */
export function DatingColorFilter({ choices, onToggle }: DatingColorFilterProps) {
    const [t] = useTranslation("dating");

    return (
        <div role={"group"} aria-label={t("accessibility.color-filter")} className={"flex items-center gap-1"}>
            {COLORS.map((color) => {
                const choice = choices.get(color);
                const name = t(`accessibility.color-${color.toLowerCase()}`);
                return (
                    <button
                        key={color}
                        type={"button"}
                        aria-label={t(`accessibility.color-${choice ?? "allowed"}`, { color: name })}
                        onClick={() => onToggle(color)}
                        className={
                            "relative flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-lime-500"
                        }
                    >
                        <ManaCost
                            value={`{${color}}`}
                            className={clsx(
                                "transition duration-150",
                                choice === "excluded" && "opacity-30 grayscale",
                                choice === "required" && "scale-125",
                            )}
                            symbolClassName={clsx(
                                "size-7",
                                choice === "required" && "rounded-full ring-2 ring-lime-500",
                            )}
                        />
                        {choice === "excluded" && (
                            <span
                                aria-hidden={true}
                                className={"absolute h-0.5 w-9 -rotate-45 rounded-full bg-zinc-600 dark:bg-zinc-300"}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
