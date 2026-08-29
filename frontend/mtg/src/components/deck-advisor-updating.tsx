import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { useTranslation } from "react-i18next";

/**
 * The floating "updating" pill above an advisor list that is being refetched.
 *
 * Absolutely positioned into the top-right corner of the nearest positioned
 * ancestor rather than rendered into the flow, deliberately: the hint comes
 * and goes with every refetch, and an in-flow element appearing that often
 * shoves the whole list down and back up each time — the exact jumping this
 * page is trying to get rid of. Floating, it covers a sliver of whitespace
 * beside the list's first heading and moves nothing. The surface and ring
 * keep it readable when a narrow viewport slides a tile underneath it.
 *
 * @returns the pill
 */
export function DeckAdvisorUpdating() {
    const [t] = useTranslation("advisor");

    return (
        <p
            className={
                "absolute -top-1 right-0 z-10 flex items-center gap-1.5 rounded-full bg-(--surface-card) px-2.5 py-1 text-xs text-zinc-500 shadow-(--shadow-card-sm) ring-1 ring-zinc-950/5 dark:text-zinc-400 dark:ring-white/10"
            }
        >
            <ArrowPathIcon className={"size-3.5 animate-spin"} />
            {t("label.updating")}
        </p>
    );
}
