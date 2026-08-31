import { RectangleStackIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { Button } from "components";
import { useTranslation } from "react-i18next";

/**
 * Props for {@link DeckAdvisorAutofillBanner}
 */
export type DeckAdvisorAutofillBannerProps = {
    /** How many cards are still needed */
    remaining: number;
    /** Called when user clicks the fill button */
    onFill: () => void;
};

/**
 * Build-phase banner promoting auto-fill for quickly completing the deck.
 *
 * @returns the banner
 */
export function DeckAdvisorAutofillBanner({ remaining, onFill }: DeckAdvisorAutofillBannerProps) {
    const [t] = useTranslation("advisor");

    return (
        <div
            className={clsx(
                "flex flex-col rounded-(--radius-card) bg-(--surface-card) p-4 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:ring-white/10",
                "gap-2",
            )}
        >
            <p className="text-sm font-medium text-zinc-900 dark:text-white">{t("label.autofill-title")}</p>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {t("label.autofill-remaining", { count: remaining })}
                </p>
                <Button onClick={onFill} size="sm" color="blue">
                    <RectangleStackIcon />
                    {t("button.fill")}
                </Button>
            </div>
        </div>
    );
}
