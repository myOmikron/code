import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ManaCost } from "src/components/mana-cost";
import { COLORS } from "src/utils/dating";
import type { Color } from "src/utils/dating";

/**
 * The properties for {@link DatingColorFilter}
 */
export type DatingColorFilterProps = {
    /** The colors switched on; none means every color */
    selected: ReadonlySet<Color>;
    /** Switch one color */
    onToggle: (color: Color) => void;
};

/**
 * Five mana symbols that narrow the stack to Commanders within the chosen colors.
 *
 * @returns the filter
 */
export function DatingColorFilter({ selected, onToggle }: DatingColorFilterProps) {
    const [t] = useTranslation("dating");
    const all = selected.size === 0;

    return (
        <div role={"group"} aria-label={t("accessibility.color-filter")} className={"flex items-center gap-1"}>
            {COLORS.map((color) => {
                const on = all || selected.has(color);
                return (
                    <button
                        key={color}
                        type={"button"}
                        aria-pressed={selected.has(color)}
                        onClick={() => onToggle(color)}
                        className={clsx(
                            "flex size-11 items-center justify-center rounded-full transition-opacity focus-visible:outline-2 focus-visible:outline-lime-500",
                            on ? "opacity-100" : "opacity-30",
                        )}
                    >
                        <ManaCost
                            value={`{${color}}`}
                            symbolClassName={clsx("size-7", selected.has(color) && "rounded-full ring-2 ring-lime-500")}
                        />
                    </button>
                );
            })}
        </div>
    );
}
