import clsx from "clsx";

/**
 * The properties for {@link SplitToggle}
 */
export type SplitToggleProps<Option extends string> = {
    /** The ways the chart can be cut, in the order they are offered */
    options: Array<Option>;
    /** The one in use */
    value: Option;
    /** Called with the option that was picked */
    onChange: (option: Option) => void;
    /** What an option is called */
    nameOf: (option: Option) => string;
};

/**
 * The row of buttons that decides how a chart is broken up.
 *
 * @returns the buttons
 */
export function SplitToggle<Option extends string>({ options, value, onChange, nameOf }: SplitToggleProps<Option>) {
    return (
        <span
            className={
                "flex shrink-0 items-center rounded-(--radius-control) bg-zinc-950/5 p-0.5 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:ring-white/10"
            }
        >
            {options.map((option) => (
                <button
                    key={option}
                    type={"button"}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={clsx(
                        "rounded-[calc(var(--radius-control)-0.125rem)] px-2 py-1 text-xs transition",
                        value === option
                            ? "bg-(--surface-card) text-zinc-950 shadow-(--shadow-card-sm) dark:text-white"
                            : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
                    )}
                >
                    {nameOf(option)}
                </button>
            ))}
        </span>
    );
}
