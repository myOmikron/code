/**
 * Same-origin copies of Scryfall's symbols, shipped and precached with the app.
 *
 * @param symbol a card symbol, optionally wrapped in braces
 * @returns the local URL of the symbol's SVG
 */
export function cardSymbolUrl(symbol: string): string {
    const name = symbol.replace(/[{}/]/g, "").toUpperCase();
    const filename = name === "½" ? "HALF" : name === "∞" ? "INFINITY" : name;
    return `/card-symbols/${encodeURIComponent(filename)}.svg`;
}
