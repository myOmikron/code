/** Same-origin copies of Scryfall's symbols, shipped and precached with the app. */
export function cardSymbolUrl(symbol: string): string {
    const name = symbol.replace(/[{}\/]/g, "").toUpperCase();
    const filename = name === "½" ? "HALF" : name === "∞" ? "INFINITY" : name;
    return `/card-symbols/${encodeURIComponent(filename)}.svg`;
}
