import { DeckCardResponse } from "src/api/generated";
import { DeckEntry } from "src/api/graph-generated";

/**
 * The projection of a deck the graph advisor reads: the played deck, folded
 * to oracle identities.
 *
 * Only the mainboard and the command zone count — the advisor judges what is
 * actually played, so sideboard and maybeboard moves must not change its read.
 */
export type AdvisorDeck = {
    /** The played cards, one entry per oracle identity, sorted for stability */
    entries: Array<DeckEntry>;
    /** The commander's oracle id, when the command zone holds one the catalog knows */
    commander: string | null;
    /** Copies without an oracle identity — printings the catalog does not know yet */
    unknown: number;
};

/**
 * Folds a deck's slots into the advisor's projection.
 *
 * Printings collapse into their oracle identity, so a re-art or language swap
 * yields the identical projection — and, through {@link advisorSignature},
 * cannot trigger a new analysis.
 *
 * A Partner deck holds two commanders; the advisor anchors on the first one.
 *
 * @param cards every slot of the deck, as the loader holds them
 *
 * @returns the projection
 */
export function advisorDeck(cards: Array<DeckCardResponse>): AdvisorDeck {
    const copies = new Map<string, number>();
    let commander: string | null = null;
    let unknown = 0;
    for (const slot of cards) {
        if (slot.zone !== "Main" && slot.zone !== "Commander") continue;
        const oracle = slot.card?.oracle_id;
        if (oracle == null) {
            unknown += slot.quantity;
            continue;
        }
        copies.set(oracle, (copies.get(oracle) ?? 0) + slot.quantity);
        if (slot.zone === "Commander" && commander === null) commander = oracle;
    }
    const entries = [...copies.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([oracle_id, qty]) => ({ oracle_id, qty }));
    return { entries, commander, unknown };
}

/**
 * Content-addresses exactly what the graph is asked about.
 *
 * Derived from the projection and nothing else: renames, printing swaps, tag
 * edits and sideboard moves are structurally incapable of producing a new
 * signature, which is what keeps the analysis from thrashing while a deck is
 * being groomed.
 *
 * @param deck the projection
 * @param speed the speed the analysis is asked at, 0 to 1
 *
 * @returns a string equal iff the analysis request would be equal
 */
export function advisorSignature(deck: AdvisorDeck, speed: number): string {
    const cards = deck.entries.map((entry) => `${entry.oracle_id}:${entry.qty}`).join(",");
    return `${speed};${deck.commander ?? ""};${cards}`;
}

/**
 * Maps the deck's claimed Commander bracket onto the advisor's speed scale.
 *
 * The five brackets spread evenly over [0, 1]; a deck that claims none is
 * read at the middle, which is the advisor's own default.
 *
 * The one place the advisor takes its speed from — the deck's claim is the
 * whole of the setting, and the chip beside the deck's name is where it is
 * made.
 *
 * @param bracket the bracket 1–5, or nothing
 *
 * @returns the speed, 0 to 1
 */
export function bracketSpeed(bracket: number | null | undefined): number {
    return bracket == null ? 0.5 : (bracket - 1) / 4;
}
