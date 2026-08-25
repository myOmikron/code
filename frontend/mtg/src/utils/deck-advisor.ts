import { DeckCardResponse } from "src/api/generated";
import { DeckEntry } from "src/api/graph-generated";
import { letters } from "src/utils/deck-rules";

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
    /** Every card the deck fields as a commander, in zone order — the first is {@link commander} */
    commanders: Array<string>;
    /** The colours the deck claims for itself, `null` while it follows its commanders */
    identity: Array<string> | null;
    /** Copies without an oracle identity — printings the catalog does not know yet */
    unknown: number;
};

/** What the deck says about itself beyond its slots */
export type AdvisorOptions = {
    /**
     * The deck's colour-identity override, as it is stored — `null` or absent
     * while the deck follows its commanders
     */
    allowedColorIdentity?: string | null;
};

/**
 * Folds a deck's slots into the advisor's projection.
 *
 * Printings collapse into their oracle identity, so a re-art or language swap
 * yields the identical projection — and, through {@link advisorSignature},
 * cannot trigger a new analysis.
 *
 * A Partner deck holds two commanders: `commanders` names all of them, in the
 * order the command zone holds them, and the advisor anchors on the first.
 *
 * `identity` stays `null` unless the deck actually overrules its colours — a
 * deck that follows its commanders must keep asking the graph the same
 * question it asked before this field existed, or every warm cache misses for
 * nothing.
 *
 * @param cards every slot of the deck, as the loader holds them
 * @param opts what the deck claims beyond its slots
 *
 * @returns the projection
 */
export function advisorDeck(cards: Array<DeckCardResponse>, opts?: AdvisorOptions): AdvisorDeck {
    const copies = new Map<string, number>();
    const commanders: Array<string> = [];
    let unknown = 0;
    for (const slot of cards) {
        if (slot.zone !== "Main" && slot.zone !== "Commander") continue;
        const oracle = slot.card?.oracle_id;
        if (oracle == null) {
            unknown += slot.quantity;
            continue;
        }
        copies.set(oracle, (copies.get(oracle) ?? 0) + slot.quantity);
        if (slot.zone === "Commander" && !commanders.includes(oracle)) commanders.push(oracle);
    }
    const entries = [...copies.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([oracle_id, qty]) => ({ oracle_id, qty }));
    const override = opts?.allowedColorIdentity;
    return {
        entries,
        commander: commanders[0] ?? null,
        commanders,
        identity: override == null ? null : letters(override),
        unknown,
    };
}

/**
 * Content-addresses exactly what the graph is asked about.
 *
 * Derived from the projection and nothing else: renames, printing swaps, tag
 * edits and sideboard moves are structurally incapable of producing a new
 * signature, which is what keeps the analysis from thrashing while a deck is
 * being groomed.
 *
 * Everything the graph is told has to be in here — every commander, not just
 * the anchor, and the claimed colours — or a cache built before one of them
 * changed answers a question that is no longer being asked.
 *
 * @param deck the projection
 * @param speed the speed the analysis is asked at, 0 to 1
 *
 * @returns a string equal iff the analysis request would be equal
 */
export function advisorSignature(deck: AdvisorDeck, speed: number): string {
    const cards = deck.entries.map((entry) => `${entry.oracle_id}:${entry.qty}`).join(",");
    return `${speed};${deck.commanders.join("+")};${deck.identity?.join("") ?? "-"};${cards}`;
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
