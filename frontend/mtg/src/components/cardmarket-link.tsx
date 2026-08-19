import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { cardmarketSettings, cardmarketUrl, subscribeCardmarketSettings } from "src/utils/cardmarket";
import type { CardmarketCard } from "src/utils/cardmarket";
import CardmarketIcon from "src/assets/cardmarket.svg?react";
import { ExternalLinkRow } from "src/components/external-link-row";

/**
 * How the link carries itself:
 *
 * - `icon`: quiet, for a list row that already says everything else
 * - `overlay`: the same, but sitting on artwork and needing its own contrast
 * - `row`: mark and name in a framed row, for the dialog's list of shops
 */
export type CardmarketLinkVariant = "icon" | "overlay" | "row";

/** The classes the two compact variants carry; `row` brings its own frame */
const VARIANTS: Record<"icon" | "overlay", string> = {
    icon: "inline-flex items-center justify-center rounded-(--radius-control) p-1 opacity-80 transition hover:opacity-100",
    overlay:
        "z-10 inline-flex items-center justify-center rounded-full bg-zinc-950/75 p-1.5 text-white shadow-lg ring-2 ring-white/75 backdrop-blur-sm transition hover:bg-zinc-950",
};

/**
 * How the logo itself is drawn per variant.
 *
 * Cardmarket's navy in light mode and white in dark, which are the two
 * colorways the brand ships; the logo is the only thing in the app allowed to
 * wear them. The overlay takes neither: it sits in a near-black chip on
 * artwork, where white comes from the chip's own text color.
 *
 * In a row the mark keeps the size of the icon beside the shop's name, which
 * is the size the rows above it use as well.
 */
const ICONS: Record<CardmarketLinkVariant, string> = {
    icon: "size-4 text-cardmarket dark:text-white",
    overlay: "size-5",
    row: "size-4 shrink-0 text-cardmarket dark:text-white",
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
    const href = cardmarketUrl(card, finish, settings);

    if (variant === "row")
        return (
            <ExternalLinkRow href={href} label={label} className={className}>
                <span className={"flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white"}>
                    <CardmarketIcon className={ICONS[variant]} aria-hidden={true} />
                    {"Cardmarket"}
                </span>
            </ExternalLinkRow>
        );

    return (
        // A plain anchor, not `TextLink`, which is typed against the app's own
        // route table and cannot take an external url.
        <a
            href={href}
            target={"_blank"}
            rel={"noreferrer"}
            title={label}
            aria-label={label}
            // A row opens the card dialog when clicked; the link must not do
            // both.
            onClick={(event) => event.stopPropagation()}
            className={`${VARIANTS[variant]} ${className ?? ""}`}
        >
            <CardmarketIcon className={ICONS[variant]} aria-hidden={true} />
        </a>
    );
}
