import { ArrowsRightLeftIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { Badge, Button } from "components";
import { useTranslation } from "react-i18next";
import { CardFinish } from "src/api/generated";
import { CardThumbnail } from "src/components/card-thumbnail";
import { formatCurrency } from "src/utils/format";
import { roleLabel } from "src/utils/graph-vocabulary";
import { Printing } from "src/utils/scryfall";

/**
 * The properties for {@link DeckAdvisorAddRow}
 */
export type DeckAdvisorAddRowProps = {
    /** The offered card's name, which is also how its artwork was looked up */
    name: string;
    /** The card it would take the slot of, so the trade can be spelled out */
    replaces: string;
    /** The resolved card, `undefined` while the lookup is out or after it failed */
    printing: Printing | undefined;
    /**
     * Short buckets this card joins, when the exchange is a shape fix rather
     * than a like-for-like replacement.
     *
     * Shown instead of the shared roles: a card taking a slot in the bucket
     * the deck is short of shares no role with the one it replaces — doing
     * something *different* is the entire reason it is offered.
     */
    fills?: Array<string>;
    /** The roles it shares with the card going out, so the fit is visible */
    sharedRoles?: Array<string>;
    /** Opens the card, its rules text and its printing */
    onOpen: (printing: Printing) => void;
    /** Called when this card should never be offered again, anywhere */
    onIgnore: () => void;
    /** Called to put this card in the slot and take the other one out */
    onSwap: () => void;
    /** Whether a card is already moving, which holds the row's actions */
    busy: boolean;
};

/**
 * One card offered for a slot: what it looks like, why it fits, and the trade.
 *
 * The single surface for an offer, wherever the offer is made — beside the
 * card it would replace in the exchange list, and inside the alternatives
 * dialog opened from a deck's cards page. Both ask the same question about
 * the same kind of thing, so both read the same: artwork to open, the name,
 * the argument as chips, what it costs, and the two answers — never again, or
 * swap it in.
 *
 * @returns the row
 */
export function DeckAdvisorAddRow({
    name,
    replaces,
    printing,
    fills = [],
    sharedRoles = [],
    onOpen,
    onIgnore,
    onSwap,
    busy,
}: DeckAdvisorAddRowProps) {
    const [t] = useTranslation("advisor");
    return (
        <div className={"flex items-center gap-2.5 py-2"}>
            <button
                type={"button"}
                disabled={printing === undefined}
                onClick={() => printing !== undefined && onOpen(printing)}
                aria-label={t("accessibility.open-card", { name })}
                title={t("accessibility.open-card", { name })}
                className={
                    "w-11 shrink-0 cursor-zoom-in rounded-(--radius-control) transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-default"
                }
            >
                <CardThumbnail
                    name={name}
                    image={printing?.largeImageUrl ?? null}
                    thumbnail={printing?.imageUrl ?? null}
                    sizes={"44px"}
                    finish={CardFinish.Nonfoil}
                    className={"w-full"}
                />
            </button>
            <div className={"min-w-0 flex-1"}>
                <div className={"truncate text-sm font-medium text-zinc-950 dark:text-white"}>{name}</div>
                {(fills.length > 0 || sharedRoles.length > 0) && (
                    <div className={"mt-0.5 flex flex-wrap gap-1"}>
                        {/* Why this card fits this slot rather than any. A
                            shortfall it answers outranks a role it merely
                            shares. */}
                        {fills.map((bucket) => (
                            <Badge key={bucket} color={"lime"}>
                                {t("label.swap-fills", { bucket: t(`label.bucket-${bucket.replace(/_/g, "-")}`) })}
                            </Badge>
                        ))}
                        {fills.length === 0 &&
                            sharedRoles.map((role) => (
                                <Badge key={role} color={"zinc"}>
                                    {roleLabel(t, role)}
                                </Badge>
                            ))}
                    </div>
                )}
            </div>
            {printing?.priceEur != null && (
                <span className={"shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"}>
                    {formatCurrency(printing.priceEur)}
                </span>
            )}
            {/* Same eye as the adds list, and the same meaning: this card,
                never again — not "not for this slot". */}
            <Button
                plain={true}
                title={t("accessibility.ignore-card", { name })}
                aria-label={t("accessibility.ignore-card", { name })}
                onClick={onIgnore}
            >
                <EyeSlashIcon />
            </Button>
            {/* The app's swap glyph (see the deck card menu), and the outline
                keeps it the row's loud action beside the quiet eye. The trade
                itself is already spelled out by the row; the label repeats it
                for hover and screen readers. */}
            <Button
                outline={true}
                disabled={busy || printing === undefined}
                title={t("accessibility.swap-cards", { cut: replaces, name })}
                aria-label={t("accessibility.swap-cards", { cut: replaces, name })}
                onClick={onSwap}
            >
                <ArrowsRightLeftIcon />
            </Button>
        </div>
    );
}
