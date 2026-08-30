import { DeckCardResponse } from "src/api/generated";
import { DeckEntry, Swap, SuggestionReport } from "src/api/graph-generated";
import { isBasicLand } from "src/utils/card-types";
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
    /**
     * How many cards the deck is built to *outside* the command zone, which is
     * the only sense the graph has of a deck's size — `null` while nothing says
     */
    deckSize: number | null;
    /** Copies without an oracle identity — printings the catalog does not know yet */
    unknown: number;
};

/**
 * The names of the played cards — mainboard and command zone, the same zones
 * {@link advisorDeck} counts.
 *
 * The combo lookup wants names where the projection wants oracle ids, and
 * both route tabs ask it about the same deck: one definition of "played"
 * serves them both, so a change to which zones count is a change in one
 * place.
 *
 * @param cards every slot of the deck, as the loader holds them
 *
 * @returns the names, one per slot that has one
 */
export function playedNames(cards: Array<DeckCardResponse>): Array<string> {
    return cards
        .filter((slot) => slot.zone === "Main" || slot.zone === "Commander")
        .flatMap((slot) => (slot.card?.name == null ? [] : [slot.card.name]));
}

/** What the deck says about itself beyond its slots */
export type AdvisorOptions = {
    /**
     * The deck's colour-identity override, as it is stored — `null` or absent
     * while the deck follows its commanders
     */
    allowedColorIdentity?: string | null;
    /**
     * How many cards the deck is built to, the commanders counted in: the
     * table's agreed size, or the format's own number when they agreed none.
     *
     * Absent leaves the graph on its default.
     */
    targetSize?: number | null;
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
    let commandZone = 0;
    let unknown = 0;
    for (const slot of cards) {
        if (slot.zone !== "Main" && slot.zone !== "Commander") continue;
        // Counted before the catalog is consulted: a commander whose printing
        // the catalog cannot place still occupies the command zone, and the
        // size below is arithmetic about slots, not about known cards.
        if (slot.zone === "Commander") commandZone += slot.quantity;
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
        deckSize: graphDeckSize(opts?.targetSize, commandZone),
        unknown,
    };
}

/**
 * The size the graph is told, from the size the deck is built to.
 *
 * The two numbers count differently and the subtraction is the whole of the
 * difference: a deck's target counts its commanders in — Commander asks for
 * exactly 100 cards, command zone included — while the graph's `deck_size` is
 * the cards outside the command zone, which is why its default is 99. A deck
 * by the book therefore lands on exactly that default and asks the graph
 * nothing new; two partners ask for 98, which is the number of slots they
 * actually have to fill.
 *
 * The one place the subtraction happens.
 *
 * @param target the size the deck is built to, commanders counted in
 * @param commandZone how many cards sit in the command zone
 *
 * @returns the size to send, `null` when nothing says
 */
function graphDeckSize(target: number | null | undefined, commandZone: number): number | null {
    // A target no larger than its own command zone leaves nothing to fill. The
    // service refuses a size below 1, so the floor keeps a nonsensical setting
    // from turning every request into a rejection.
    return target == null ? null : Math.max(1, target - commandZone);
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
 * the anchor, the claimed colours and the size the deck is built to — or a
 * cache built before one of them changed answers a question that is no longer
 * being asked.
 *
 * @param deck the projection
 * @param speed the speed the analysis is asked at, 0 to 1
 *
 * @returns a string equal iff the analysis request would be equal
 */
export function advisorSignature(deck: AdvisorDeck, speed: number): string {
    const cards = deck.entries.map((entry) => `${entry.oracle_id}:${entry.qty}`).join(",");
    const size = deck.deckSize ?? "-";
    return `${speed};${deck.commanders.join("+")};${deck.identity?.join("") ?? "-"};${size};${cards}`;
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

/**
 * How many copies one click on a suggested card files into the deck.
 *
 * Anything nonbasic goes in as a single copy — Commander allows no more. A
 * basic land is the exception: a deck short on lands wants a handful, and
 * clicking the same tile eight times is busywork the advisor caused. The
 * handful shrinks as the colour count grows, because the same shortfall is
 * split across more names: one add places `6 - colours` copies, floored at a
 * single copy for a five-colour deck — and handing a colourless deck six
 * Wastes, the one name it has.
 *
 * @param typeLine the suggested card's type line
 * @param colorCount how many colours the deck's identity spans
 *
 * @returns the copies one add should place
 */
export function suggestionAddQuantity(typeLine: string, colorCount: number): number {
    return isBasicLand(typeLine) ? Math.max(1, 6 - colorCount) : 1;
}

/**
 * Removes suggestions the deck now holds, mirroring what the service's next
 * answer would say before that answer has arrived.
 *
 * A suggestion accepted this session leaves the flat ranking and every group
 * it appeared in, groups left empty are dropped rather than shown headless.
 * This is what lets an accepted card leave the gallery the instant it is
 * clicked instead of waiting out the seconds a fresh report takes — the
 * caller renders this filtered report, while the *unfiltered* one still goes
 * to the radar normalisation, so the cards that remain do not jump shape
 * because a peer was removed from view.
 *
 * @param report the suggestions half of a swaps answer
 * @param accepted oracle ids the deck now holds this session
 *
 * @returns the report with every accepted card removed
 */
export function filterReport(report: SuggestionReport, accepted: Array<string>): SuggestionReport {
    if (accepted.length === 0) return report;
    const acceptedIds = new Set(accepted);
    const keeps = (suggestion: { oracle_id: string }) => !acceptedIds.has(suggestion.oracle_id);
    return {
        ...report,
        suggestions: report.suggestions.filter(keeps),
        groups: report.groups
            ?.map((group) => ({ ...group, suggestions: group.suggestions.filter(keeps) }))
            .filter((group) => group.suggestions.length > 0),
    };
}

/**
 * Filters the service's add-centric swap pairings down to the exchanges that
 * are still live.
 *
 * The service answers in seconds; the reader's own click acts sooner than
 * that. A "keep" lands in `accepted` the instant it is clicked, and a cut or
 * swap already made removes the card's Main-zone slot from `cards` the
 * instant the loader refetches — both well before the graph catches up. This
 * is what lets the acted-on row leave the cuts tab immediately instead of
 * waiting out the next report.
 *
 * @param swaps the pairings as the service returned them
 * @param accepted oracle ids the reader kept, or the deck now holds, this session
 * @param cards every slot of the deck, as the loader holds them
 *
 * @returns the pairings whose cut card is still a live candidate
 */
export function filterSwaps(swaps: Array<Swap>, accepted: Array<string>, cards: Array<DeckCardResponse>): Array<Swap> {
    // No early return on an empty `accepted`, unlike {@link filterReport}: the
    // Main-zone check below is not gated on it — a plain cut leaves `accepted`
    // untouched, and its row still has to disappear the moment the slot does.
    return swaps.filter(
        (pairing) =>
            !accepted.includes(pairing.cut.oracle_id) &&
            cards.some((slot) => slot.zone === "Main" && slot.card?.oracle_id === pairing.cut.oracle_id),
    );
}
