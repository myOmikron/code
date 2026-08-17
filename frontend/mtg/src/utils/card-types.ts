/**
 * The one card type a card is filed under.
 *
 * Mirrors `primary_type` in the backend's collection statistics, so a deck
 * grouped by type and a collection counted by type agree on what a card is.
 * A card has several types more often than not — every Artifact Creature is
 * both — so exactly one wins, and lands win over everything because that is
 * how a decklist is read.
 */

/**
 * The types, as (needle, slug).
 *
 * The order here decides which type a card with several of them is filed under,
 * which is why land leads: a Land Creature is a land in every decklist. What
 * order the *groups* are drawn in is a different question, see
 * {@link TYPE_GROUP_ORDER}.
 */
const TYPE_ORDER: Array<[string, string]> = [
    ["land", "land"],
    ["creature", "creature"],
    ["planeswalker", "planeswalker"],
    ["battle", "battle"],
    ["instant", "instant"],
    ["sorcery", "sorcery"],
    ["enchantment", "enchantment"],
    ["artifact", "artifact"],
    ["conspiracy", "conspiracy"],
    ["dungeon", "dungeon"],
    ["phenomenon", "phenomenon"],
    ["plane", "plane"],
    ["scheme", "scheme"],
    ["vanguard", "vanguard"],
];

/**
 * The slugs in the order the groups are drawn in.
 *
 * What is cast first stands first, and the lands close the list — that is how a
 * decklist is read and how a deck is cut down. Deliberately not the order above,
 * which answers a different question.
 */
export const TYPE_GROUP_ORDER: Array<string> = [
    "creature",
    "planeswalker",
    "battle",
    "sorcery",
    "instant",
    "artifact",
    "enchantment",
    "conspiracy",
    "dungeon",
    "phenomenon",
    "plane",
    "scheme",
    "vanguard",
    "other",
    "land",
];

/**
 * Which type a card is filed under
 *
 * @param typeLine the type line as printed, both faces included
 *
 * @returns the slug, `"other"` when nothing matched
 */
export function primaryType(typeLine: string): string {
    // The front face decides: a modal double-faced card is one card, and its
    // back being a land does not make the whole thing one.
    const front = typeLine.split("//")[0]?.toLowerCase() ?? "";
    for (const [needle, slug] of TYPE_ORDER) {
        if (front.includes(needle)) return slug;
    }
    return "other";
}

/**
 * Whether a card is a basic land, which no copy limit applies to
 *
 * @param typeLine the type line as printed
 *
 * @returns whether it is basic
 */
export function isBasicLand(typeLine: string): boolean {
    const front = typeLine.split("//")[0]?.toLowerCase() ?? "";
    return front.includes("basic") && front.includes("land");
}
