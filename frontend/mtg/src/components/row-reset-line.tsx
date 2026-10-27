import { ArrowUturnLeftIcon } from "@heroicons/react/16/solid";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link RowResetLine}
 */
export type RowResetLineProps = {
    /** What the row says about itself, empty where it has nothing to add */
    verdict: string;
    /** Puts the row back to the suggestion; omitted while it already is */
    onReset?: () => void;
    /** The reset button's accessible name */
    resetLabel: string;
};

/**
 * The line under an advisor row: its verdict, and a reset that shows on hover
 *
 * @returns the line
 */
export function RowResetLine({ verdict, onReset, resetLabel }: RowResetLineProps) {
    const [t] = useTranslation("advisor");

    return (
        <div className={"-mt-0.5 flex h-5 items-center justify-between gap-3"}>
            <span className={"truncate text-xs/5 text-zinc-500 dark:text-zinc-400"}>{verdict}</span>
            {onReset !== undefined && (
                <button
                    type={"button"}
                    onClick={onReset}
                    aria-label={resetLabel}
                    className={
                        "flex shrink-0 items-center gap-1 rounded-(--radius-pill) px-1.5 py-0.5 text-xs/5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-lime-400/15 hover:text-lime-700 focus-visible:opacity-100 dark:text-zinc-500 dark:hover:bg-lime-400/15 dark:hover:text-lime-300"
                    }
                >
                    <ArrowUturnLeftIcon className={"size-3"} />
                    {t("button.reset-one")}
                </button>
            )}
        </div>
    );
}
