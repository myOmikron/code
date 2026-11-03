import type { CutCandidate, Suggestion, SuggestionGroup, SuggestionReport } from "src/api/graph-generated";
import { Badge, Dim, impact, roomFor } from "src/utils/advisor-impact";

/** One thing the advisor proposes: a card to bring in, or one to take out */
export type Move =
    | { kind: "add"; oracle_id: string; name: string; suggestion: Suggestion; badges: Array<Badge>; fact: string }
    | { kind: "cut"; oracle_id: string; name: string; cut: CutCandidate; badges: Array<Badge>; fact: string };

/** How many cuts the gallery shows: the service ranks every card in the deck */
const SHOWN_CUTS = 30;

/** The group keys a cEDH deck reads first: line-completing cards, then interaction */
const CEDH_LEAD_GROUPS = ["combo", "bucket:interaction"];

/**
 * Moves the line-completing and interaction groups to the front for a cEDH
 * deck, keeping every other group in the order the service ranked it
 *
 * @param groups the groups as the report ordered them
 *
 * @returns the same groups, `combo` and `bucket:interaction` first
 */
export function cedhGroupOrder(groups: ReadonlyArray<SuggestionGroup>): Array<SuggestionGroup> {
    const leads = CEDH_LEAD_GROUPS.map((key) => groups.find((group) => group.key === key)).filter(
        (group): group is SuggestionGroup => group !== undefined,
    );
    return [...leads, ...groups.filter((group) => !CEDH_LEAD_GROUPS.includes(group.key))];
}

/**
 * The report's suggestions in reading order, one row per card
 *
 * @param report the suggestion report
 * @param cedh whether the cEDH order applies
 *
 * @returns the suggestions, best first
 */
export function rankedAdds(report: SuggestionReport, cedh: boolean): Array<Suggestion> {
    const listed =
        cedh && report.groups !== undefined && report.groups.length > 0
            ? cedhGroupOrder(report.groups).flatMap((group) => group.suggestions)
            : report.suggestions;
    return listed.filter(
        (suggestion, index) => listed.findIndex((other) => other.oracle_id === suggestion.oracle_id) === index,
    );
}

/** What the gallery is built from */
export type MoveInput = {
    /** Cards in the deck minus the size it is built to */
    diff: number;
    adds: Array<Suggestion>;
    cuts: Array<CutCandidate>;
    dims: ReadonlyArray<Dim>;
    /** One fact per card, keyed by oracle id */
    facts: Record<string, string>;
    /** Only moves that improve this dimension, when set */
    filter: string | null;
};

/**
 * The moves the count calls for: adds while the deck is short, cuts while
 * it is over, and at size the adds that something can make room for
 *
 * @param input the deck's state and the service's answer
 * @param input.diff cards in the deck minus the size it is built to
 * @param input.adds the suggestions, best first
 * @param input.cuts the cut candidates, best first
 * @param input.dims the deck's dimensions
 * @param input.facts one fact per card
 * @param input.filter the dimension to filter by, or `null`
 *
 * @returns the moves, best first
 */
export function buildMoves({ diff, adds, cuts, dims, facts, filter }: MoveInput): Array<Move> {
    let moves: Array<Move>;
    if (diff > 0) {
        moves = cuts.slice(0, SHOWN_CUTS).map((cut) => ({
            kind: "cut",
            oracle_id: cut.oracle_id,
            name: cut.name,
            cut,
            badges: impact(null, cut, dims),
            fact: facts[cut.oracle_id] ?? "",
        }));
    } else {
        moves = adds
            .filter((add) => diff < 0 || roomFor(add, cuts, dims, 1).length > 0)
            .map((add) => ({
                kind: "add",
                oracle_id: add.oracle_id,
                name: add.name,
                suggestion: add,
                badges: impact(add, null, dims).map((badge) =>
                    diff === 0 && badge.tone === "warn" ? { ...badge, tone: "neutral" } : badge,
                ),
                fact: facts[add.oracle_id] ?? "",
            }));
    }
    return filter === null
        ? moves
        : moves.filter((move) => move.badges.some((badge) => badge.dim.key === filter && badge.tone === "good"));
}
