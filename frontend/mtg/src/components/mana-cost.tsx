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
    // `//` is kept as its own token: split cards and adventures carry both
    // halves in one string (`{2}{R} // {1}{R}`), and dropping the separator
    // turns two spells into one impossible cost.
    const tokens = value.match(/\{[^}]+\}|\/\//g) ?? [];

    return (
        <span className={`flex shrink-0 items-center gap-0.5 ${className ?? ""}`}>
            {tokens.map((token, index) => {
                if (token === "//") {
                    return (
                        <span key={`sep-${index}`} className={"px-0.5 text-xs text-zinc-500 dark:text-zinc-400"}>
                            //
                        </span>
                    );
                }
                const symbol = token.slice(1, -1);
                return (
                    <img
                        key={`${symbol}-${index}`}
                        // `{W/U}` is served as `WU.svg`, `{2/W}` as `2W.svg` —
                        // braces and the separating slash are dropped.
                        src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(symbol.replace(/\//g, "").toUpperCase())}.svg`}
                        alt={symbol}
                        loading={"lazy"}
                        className={"size-4 shrink-0"}
                    />
                );
            })}
        </span>
    );
}
