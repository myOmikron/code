import { describe, expect, it } from "vitest";
import { fromMatchLifeHistory, toMatchLifeHistory } from "src/utils/durable-match-life";
import type { LifeHistory } from "src/utils/life-history";

describe("durable Match history boundary", () => {
    it("retains Games, identities, outcomes and original operation times across server serialization", () => {
        const history: LifeHistory = {
            version: 1,
            games: [
                {
                    players: [
                        { id: "player-a", name: "Alice" },
                        { id: "player-b", name: "Bob" },
                    ],
                    startingLife: [20, 20],
                    life: [18, 20],
                    damage: [
                        [0, 0],
                        [0, 0],
                    ],
                    events: [
                        { id: "start-a", kind: "start", at: 1793102400000 },
                        { id: "life-a", kind: "life", at: 1793102401234, player: "player-a", amount: -2 },
                        { id: "end-a", kind: "end", at: 1793102402345 },
                    ],
                    outcome: { winner: "player-b" },
                },
            ],
        };
        const stored = toMatchLifeHistory(history);
        expect(stored.games[0].events[1].at).toBe("2026-10-27T12:00:01.234Z");
        expect(fromMatchLifeHistory(stored)).toEqual(history);
    });
});
