import { beforeAll, describe, expect, test } from "vitest";
import { bracketSpeed } from "src/utils/deck-advisor";

// `use-deck-lines.ts` pulls in `src/api/graph.ts`, which reads
// `window.location.origin` at module scope — harmless in the browser, fatal
// under vitest's plain Node environment without this. Same stub-then-dynamic-
// import pattern as `deck-advisor-setup.test.ts`.
(globalThis as { window?: unknown }).window ??= { location: { origin: "http://localhost" } };

let CEDH_COCKPIT_MIN_SPEED: number;
let cedhCockpitApplies: (speed: number) => boolean;

beforeAll(async () => {
    ({ CEDH_COCKPIT_MIN_SPEED, cedhCockpitApplies } = await import("src/utils/use-deck-lines"));
});

// `cedhCockpitApplies` is the exact boolean the route branches on to decide
// whether `DeckAdvisorLines`, `DeckAdvisorInteractionGrid` and
// `DeckAdvisorConsistency` mount at all, and the one `useDeckLines` itself
// guards its fetch with — so exercising it at the bracket boundaries is
// "the cEDH cockpit does not mount below speed 0.8", stated the way this
// codebase tests logic (pure functions), rather than a component-mount
// harness this project does not otherwise use.
describe("cedhCockpitApplies", () => {
    test("brackets 1 through 4 stay below the threshold", () => {
        expect(cedhCockpitApplies(bracketSpeed(1))).toBe(false);
        expect(cedhCockpitApplies(bracketSpeed(2))).toBe(false);
        expect(cedhCockpitApplies(bracketSpeed(3))).toBe(false);
        expect(cedhCockpitApplies(bracketSpeed(4))).toBe(false);
    });

    test("bracket 5 clears the threshold", () => {
        expect(cedhCockpitApplies(bracketSpeed(5))).toBe(true);
    });

    test("an unset bracket is read at the middle, below the threshold", () => {
        expect(cedhCockpitApplies(bracketSpeed(null))).toBe(false);
        expect(cedhCockpitApplies(bracketSpeed(undefined))).toBe(false);
    });

    test("the boundary itself is inclusive", () => {
        expect(cedhCockpitApplies(CEDH_COCKPIT_MIN_SPEED)).toBe(true);
        expect(cedhCockpitApplies(CEDH_COCKPIT_MIN_SPEED - 0.001)).toBe(false);
    });
});
