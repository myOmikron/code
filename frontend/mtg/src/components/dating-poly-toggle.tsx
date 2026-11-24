import { UserGroupIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link DatingPolyToggle}
 */
export type DatingPolyToggleProps = {
    /** Whether poly mode is on */
    poly: boolean;
    /** Turn it on or off */
    onPoly: (poly: boolean) => void;
};

/**
 * Poly mode: only Commanders that take a second one, and the second one is swiped too.
 *
 * @returns the toggle
 */
export function DatingPolyToggle({ poly, onPoly }: DatingPolyToggleProps) {
    const [t] = useTranslation("dating");

    return (
        <button
            type={"button"}
            aria-pressed={poly}
            title={t("accessibility.poly")}
            onClick={() => onPoly(!poly)}
            className={clsx(
                "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-500",
                poly
                    ? "bg-lime-400 text-lime-950 ring-lime-500"
                    : "text-zinc-700 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/5",
            )}
        >
            <UserGroupIcon className={"size-4"} />
            {t("button.poly")}
        </button>
    );
}
