/**
 * The properties for {@link ManaCost}
 */
export type ManaCostProps = {
    /** A mana cost string like `{1}{U}` */
    value: string;
    /** Additional CSS classes for the row */
    className?: string;
};

/**
 * Renders a mana cost string like "{1}{U}" as Scryfall's official symbols.
 *
 * The symbols come from Scryfall's svg host, which is the same origin the card
 * artwork already comes from and is explicitly exempt from their rate limits.
 * Drawing them by hand meant approximating a handful of colours and giving up
 * on everything else — hybrid, phyrexian, tap, energy — which then rendered as
 * bare text in a circle.
 *
 * The `alt` text is the symbol itself, so a failed load degrades to something
 * readable rather than a gap.
 *
 * @returns the row of symbols
 */
export function ManaCost({ value, className }: ManaCostProps) {
    const symbols = value.match(/\{([^}]+)\}/g)?.map((symbol) => symbol.slice(1, -1)) ?? [];

    return (
        <span className={`flex shrink-0 items-center gap-0.5 ${className ?? ""}`}>
            {symbols.map((symbol, index) => (
                <img
                    key={`${symbol}-${index}`}
                    // `{W/U}` is served as `WU.svg`, `{2/W}` as `2W.svg` — braces
                    // and the separating slash are dropped.
                    src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(symbol.replace(/\//g, "").toUpperCase())}.svg`}
                    alt={symbol}
                    loading={"lazy"}
                    className={"size-4 shrink-0"}
                />
            ))}
        </span>
    );
}
