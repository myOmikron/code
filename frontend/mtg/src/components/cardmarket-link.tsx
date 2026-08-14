import { ShoppingCartIcon } from "@heroicons/react/20/solid";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { cardmarketSettings, cardmarketUrl, subscribeCardmarketSettings } from "src/utils/cardmarket";
import type { CardmarketCard } from "src/utils/cardmarket";

/**
 * How the link carries itself:
 *
 * - `icon`: quiet, for a list row that already says everything else
 * - `overlay`: the same, but sitting on artwork and needing its own contrast
 * - `labelled`: spelled out, for the dialog
 */
export type CardmarketLinkVariant = "icon" | "overlay" | "labelled";

/** The classes each variant carries */
const VARIANTS: Record<CardmarketLinkVariant, string> = {
    icon: "inline-flex items-center justify-center rounded-(--radius-control) p-1 text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
    overlay:
        "inline-flex items-center justify-center rounded-full bg-zinc-950/75 p-1.5 text-white transition hover:bg-zinc-950",
    labelled:
        "inline-flex items-center gap-1 self-start text-sm text-zinc-950 underline decoration-zinc-950/50 hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:hover:decoration-white",
};

/**
 * The properties for {@link CardmarketLink}
 */
export type CardmarketLinkProps = {
    /** The printing to link to, `null` when the catalog has not caught up with it */
    card: CardmarketCard | null | undefined;
    /** The finish of the stack, so the offers shown are the ones being priced */
    finish?: CardFinish | null;
    /** How the link carries itself, quiet by default */
    variant?: CardmarketLinkVariant;
    /** Additional CSS classes */
    className?: string;
};

/**
 * A link to what this exact card costs on Cardmarket.
 *
 * The printing decides the product and the language, the stack decides the
 * finish, and the reader's settings decide the country page and the rest of the
 * filters, see `src/utils/cardmarket.ts`. Nothing is shown for a card the
 * catalog does not know: without the printing there is no version to link to.
 *
 * @returns the link, or nothing
 */
export function CardmarketLink({ card, finish = null, variant = "icon", className }: CardmarketLinkProps) {
    const [t] = useTranslation("collection");
    const settings = useSyncExternalStore(subscribeCardmarketSettings, cardmarketSettings);

    if (card == null) return null;

    const label = t("button.open-on-cardmarket");

    return (
        // A plain anchor, not `TextLink`, which is typed against the app's own
        // route table and cannot take an external url.
        <a
            href={cardmarketUrl(card, finish, settings)}
            target={"_blank"}
            rel={"noreferrer"}
            title={label}
            aria-label={variant === "labelled" ? undefined : label}
            // A row opens the card dialog when clicked; the link must not do
            // both.
            onClick={(event) => event.stopPropagation()}
            className={`${VARIANTS[variant]} ${className ?? ""}`}
        >
            {variant === "labelled" && label}
            <ShoppingCartIcon className={"size-4"} aria-hidden={true} />
        </a>
    );
}
