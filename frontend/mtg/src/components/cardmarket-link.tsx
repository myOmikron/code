import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { CardFinish } from "src/api/generated";
import { cardmarketSettings, cardmarketUrl, subscribeCardmarketSettings } from "src/utils/cardmarket";
import type { CardmarketCard } from "src/utils/cardmarket";
import CardmarketIcon from "src/assets/cardmarket.svg?react";
import CardmarketWordmark from "src/assets/cardmarket-wordmark.svg?react";
import { ExternalLinkRow } from "src/components/external-link-row";

/**
 * How the link carries itself:
 *
 * - `icon`: quiet, for a list row that already says everything else
 * - `overlay`: the same, but sitting on artwork and needing its own contrast
 * - `row`: the full logo in a framed row, for the dialog's list of shops
 */
export type CardmarketLinkVariant = "icon" | "overlay" | "row";

/** The classes the two compact variants carry; `row` brings its own frame */
const VARIANTS: Record<"icon" | "overlay", string> = {
    icon: "inline-flex items-center justify-center rounded-(--radius-control) p-1 opacity-80 transition hover:opacity-100",
    overlay:
        "inline-flex items-center justify-center rounded-full bg-zinc-950/75 p-1.5 text-white transition hover:bg-zinc-950",
};

/**
 * How the logo itself is drawn per variant.
 *
 * Cardmarket's navy in light mode and white in dark, which are the two
 * colorways the brand ships; the logo is the only thing in the app allowed to
 * wear them. The overlay takes neither: it sits in a near-black chip on
 * artwork, where white comes from the chip's own text color.
 *
 * In a row the horizontal lockup is sized by its height, with the width
 * following the name, and matches the type beside it in the rows above.
 */
const ICONS: Record<CardmarketLinkVariant, string> = {
    icon: "size-4 text-cardmarket dark:text-white",
    overlay: "size-4.5",
    row: "h-4 w-auto text-cardmarket dark:text-white",
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
                {/* The shop's own name, drawn rather than translated: the
                    dialog lists shops, and each is known by its logo. */}
                <CardmarketWordmark className={ICONS[variant]} aria-hidden={true} />
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
