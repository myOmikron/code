import { useTranslation } from "react-i18next";
import { formatCurrency } from "src/utils/format";

/**
 * The properties for {@link MarketPrice}
 */
export type MarketPriceProps = {
    /** The amount in euro */
    value: number;
    /**
     * The printing's language, as Scryfall's code.
     *
     * Left out where the caller has no printing in hand, which renders the
     * plain amount.
     */
    lang?: string | null;
    /** Additional CSS classes */
    className?: string;
};

/**
 * What a card costs, saying so when the number is the English card's.
 *
 * Scryfall quotes a euro price for the English printing of a card and for no
 * other, and Cardmarket sells every language as the one product. So the
 * catalog gives a German card the English row's price — see
 * `Printing::inherit_from_english` — which is the closest anything has to what
 * that card is worth, and is not a quote for it.
 *
 * That distinction is worth one character. A reader comparing their German
 * collection against Cardmarket should not have to wonder why the two disagree
 * by a euro.
 *
 * @returns the amount
 */
export function MarketPrice({ value, lang, className }: MarketPriceProps) {
    const [tg] = useTranslation();

    const inherited = lang != null && lang !== "" && lang !== "en";
    const amount = formatCurrency(value);

    if (!inherited) return <span className={className}>{amount}</span>;

    return (
        <span className={className} title={tg("label.price-from-english")}>
            {"≈ "}
            {amount}
        </span>
    );
}
