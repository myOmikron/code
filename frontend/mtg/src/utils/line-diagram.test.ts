import { describe, expect, test } from "vitest";
import { LineEntry } from "src/api/graph-generated";
import { LineFamily } from "src/utils/line-families";
import { layoutLineDiagram, layoutLineDiagramFamily } from "src/utils/line-diagram";

/**
 * A minimal line piece
 *
 * @param name the card's name
 * @param inDeck whether it is actually in the deck
 *
 * @returns the piece
 */
function piece(name: string, inDeck = true) {
    return { name, oracle_id: name, zones: ["B"], must_be_commander: false, in_deck: inDeck };
}

/**
 * A minimal complete line
 *
 * @param id the line's id
 * @param cardNames its card names, in order
 * @param popularity how many decks play it
 *
 * @returns the line
 */
function completeLine(id: string, cardNames: Array<string>, popularity = 1): LineEntry {
    return {
        id,
        cards: cardNames.map((name) => piece(name)),
        mana_needed: "",
        mana_value_needed: 0,
        identity: [],
        produces: [],
        bracket_tag: "",
        popularity,
        prerequisites: { easy: "", notable: "" },
        folds_to: [],
        complete: true,
        missing: [],
    };
}

/**
 * A minimal near-miss line, one card short
 *
 * @param id the line's id
 * @param presentCards the cards it already holds
 * @param missingCard the one card it is short
 * @param popularity how many decks play it
 *
 * @returns the line
 */
function nearMissLine(id: string, presentCards: Array<string>, missingCard: string, popularity = 1): LineEntry {
    return {
        id,
        cards: [...presentCards.map((name) => piece(name)), piece(missingCard, false)],
        mana_needed: "",
        mana_value_needed: 0,
        identity: [],
        produces: [],
        bracket_tag: "",
        popularity,
        prerequisites: { easy: "", notable: "" },
        folds_to: [],
        complete: false,
        missing: [missingCard],
    };
}

describe("layoutLineDiagramFamily", () => {
    test("a single-line family plots one solid edge per pair of its cards", () => {
        const family: LineFamily = { key: "f", hub: "A", lines: [completeLine("1", ["A", "B", "C"])] };
        const laid = layoutLineDiagramFamily(family, []);

        expect(laid.nodes.map((n) => n.name).sort()).toEqual(["A", "B", "C"]);
        expect(laid.nodes.every((n) => !n.ghost)).toBe(true);
        // 3 cards -> 3 unordered pairs, each drawn once even though every
        // pair co-occurs in the same single line.
        expect(laid.edges).toHaveLength(3);
        expect(laid.edges.every((e) => !e.dashed)).toBe(true);
    });

    test("two lines sharing a pair do not duplicate that edge", () => {
        const family: LineFamily = {
            key: "f",
            hub: "X",
            lines: [completeLine("1", ["X", "Y"]), completeLine("2", ["X", "Y"])],
        };
        const laid = layoutLineDiagramFamily(family, []);
        expect(laid.edges).toHaveLength(1);
    });

    test("a near-miss line anchored in the family adds one ghost node with a dashed edge", () => {
        const family: LineFamily = { key: "f", hub: "A", lines: [completeLine("1", ["A", "B"])] };
        const nearMisses = [nearMissLine("nm", ["A"], "Ghost")];
        const laid = layoutLineDiagramFamily(family, nearMisses);

        const ghost = laid.nodes.find((n) => n.name === "Ghost");
        expect(ghost?.ghost).toBe(true);
        expect(laid.edges).toContainEqual({ from: "Ghost", to: "A", dashed: true });
    });

    test("a near-miss line with no anchor in this family is not plotted", () => {
        const family: LineFamily = { key: "f", hub: "A", lines: [completeLine("1", ["A", "B"])] };
        const nearMisses = [nearMissLine("nm", ["Unrelated"], "Ghost")];
        const laid = layoutLineDiagramFamily(family, nearMisses);

        expect(laid.nodes.some((n) => n.name === "Ghost")).toBe(false);
    });

    test("a near-miss line missing more than one card is left out of the diagram", () => {
        const family: LineFamily = { key: "f", hub: "A", lines: [completeLine("1", ["A", "B"])] };
        const twoMissing: LineEntry = {
            ...nearMissLine("nm", ["A"], "Ghost1"),
            missing: ["Ghost1", "Ghost2"],
        };
        const laid = layoutLineDiagramFamily(family, [twoMissing]);
        expect(laid.nodes.some((n) => n.ghost)).toBe(false);
    });

    test("a single-node family still produces a finite, positive-size layout", () => {
        const family: LineFamily = { key: "f", hub: "Solo", lines: [completeLine("1", ["Solo"])] };
        const laid = layoutLineDiagramFamily(family, []);
        expect(laid.nodes).toHaveLength(1);
        expect(Number.isFinite(laid.nodes[0].x)).toBe(true);
        expect(Number.isFinite(laid.nodes[0].y)).toBe(true);
        expect(laid.width).toBeGreaterThan(0);
        expect(laid.height).toBeGreaterThan(0);
    });
});

describe("layoutLineDiagram", () => {
    test("folds tutor reach onto the matching ghost node only", () => {
        const families: Array<LineFamily> = [{ key: "f", hub: "A", lines: [completeLine("1", ["A", "B"])] }];
        const lines = [completeLine("1", ["A", "B"]), nearMissLine("nm", ["A"], "Ghost")];
        const tutorsByLine = new Map([["nm", ["Demonic Tutor", "Vampiric Tutor"]]]);

        const [diagram] = layoutLineDiagram(families, lines, tutorsByLine);
        const ghost = diagram.nodes.find((n) => n.name === "Ghost");
        const real = diagram.nodes.find((n) => n.name === "A");

        expect(ghost?.tutors).toEqual(["Demonic Tutor", "Vampiric Tutor"]);
        expect(real?.tutors).toEqual([]);
    });
});
