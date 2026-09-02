import { beforeAll, describe, expect, test } from "vitest";

// cEDH (bracket 5) is a format, not a louder bracket 4 — offering it the
// same €100 ceiling every other bracket opens on is the wrong opening bid.
// These two functions are the wizard's single source of truth for when that
// exception applies; the dialog's own step transitions and its re-seeding
// effect both call through them rather than re-deriving the rule.
//
// The component pulls in `src/api/graph.ts` (via DeckAdvisorPool), which
// reads `window.location.origin` at module scope for its API base path —
// harmless in the browser, but this suite runs under vitest's plain Node
// environment, which has no `window` at all. A static import would blow up
// before a single test ran, so the module is loaded dynamically, after
// stubbing just enough of `window` for that one read to succeed.
(globalThis as { window?: unknown }).window ??= { location: { origin: "http://localhost" } };

let defaultPoolQuery: (bracket: number | null) => string | null;
let shouldPreselectNoLimit: (bracket: number | null, budgetTouched: boolean) => boolean;

beforeAll(async () => {
    ({ defaultPoolQuery, shouldPreselectNoLimit } = await import("src/components/deck-advisor-setup"));
});

describe("defaultPoolQuery", () => {
    test("a bracket 5 deck opens on no limit", () => {
        expect(defaultPoolQuery(5)).toBeNull();
    });

    test("every other bracket, including unset, opens on the €100 ceiling", () => {
        expect(defaultPoolQuery(1)).toBe("eur<100");
        expect(defaultPoolQuery(3)).toBe("eur<100");
        expect(defaultPoolQuery(4)).toBe("eur<100");
        expect(defaultPoolQuery(null)).toBe("eur<100");
    });
});

describe("shouldPreselectNoLimit", () => {
    test("bracket 5 preselects no limit, once, before the reader has touched the budget", () => {
        expect(shouldPreselectNoLimit(5, false)).toBe(true);
    });

    test("an explicit budget choice survives a step back to bracket and forward again", () => {
        // The reader picked something for themselves after the automatic
        // preselection — stepping back to bracket 3 and forward to the
        // still-bracket-5 budget step a second time must not overwrite it.
        expect(shouldPreselectNoLimit(5, true)).toBe(false);
    });

    test("a bracket 3 deck is unaffected, touched or not", () => {
        expect(shouldPreselectNoLimit(3, false)).toBe(false);
        expect(shouldPreselectNoLimit(3, true)).toBe(false);
    });

    test("an unset bracket is unaffected", () => {
        expect(shouldPreselectNoLimit(null, false)).toBe(false);
    });
});
