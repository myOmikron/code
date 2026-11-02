import { describe, expect, it } from "vitest";
import { endingReducer, endingView, lifeOutcome } from "./life-ending";
import type { GameEnding } from "./life-ending";
import {
    changeCommanderHistory,
    changeLifeHistory,
    createLifeHistory,
    endLifeGame,
    nextLifeGame,
} from "./life-history";

const players = [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
];
const playing: GameEnding = { game: 1, phase: "playing" };

describe("ending a Game", () => {
    it("reads the last player standing off the totals, and a draw when nobody is", () => {
        const history = createLifeHistory(players, [20, 20]);
        expect(lifeOutcome(history.games[0])).toBeUndefined();
        expect(lifeOutcome(changeLifeHistory(history, 1, -20).games[0])).toEqual({ winner: "a" });
        expect(lifeOutcome(changeCommanderHistory(history, 0, 1, 21).games[0])).toEqual({ winner: "b" });
        const both = changeLifeHistory(changeLifeHistory(history, 0, -20), 1, -20);
        expect(lifeOutcome(both.games[0])).toEqual({ draw: true });
        expect(lifeOutcome(createLifeHistory([players[0]], [0]).games[0])).toBeUndefined();
    });

    it("picks a winner on the tiles, back to picking and out again", () => {
        let ending = endingReducer(playing, { type: "pick", game: 1 });
        expect(ending.phase).toBe("picking");
        ending = endingReducer(ending, { type: "choose", game: 1, outcome: { winner: "b" } });
        expect(ending).toEqual({ game: 1, phase: "picked", outcome: { winner: "b" } });
        ending = endingReducer(ending, { type: "back", game: 1 });
        expect(ending.phase).toBe("picking");
        expect(endingReducer(ending, { type: "cancel", game: 1 })).toEqual(playing);
    });

    it("ignores a step that does not fit where the ending stands", () => {
        expect(endingReducer(playing, { type: "choose", game: 1, outcome: { draw: true } })).toEqual(playing);
        expect(endingReducer(playing, { type: "back", game: 1 })).toEqual(playing);
        const picking: GameEnding = { game: 1, phase: "picking" };
        expect(endingReducer(picking, { type: "play-on", game: 1, outcome: { draw: true } })).toEqual(picking);
    });

    it("forgets the last Game's ending once the next one is played", () => {
        const picked: GameEnding = { game: 1, phase: "picked", outcome: { winner: "a" } };
        expect(endingReducer(picked, { type: "back", game: 2 })).toEqual({ game: 2, phase: "playing" });
        const history = nextLifeGame(
            endLifeGame(createLifeHistory(players, [20, 20]), { winner: "a" }),
            players,
            [20, 20],
        );
        expect(endingView(picked, history, true)).toEqual({ kind: "playing" });
    });
});

describe("what the tiles show", () => {
    const fallen = changeLifeHistory(createLifeHistory(players, [20, 20]), 1, -20);

    it("shows the verdict once one player is left, only where a Match is counted", () => {
        expect(endingView(playing, fallen, true)).toEqual({
            kind: "verdict",
            outcome: { winner: "a" },
            picked: false,
        });
        expect(endingView(playing, fallen, false)).toEqual({ kind: "playing" });
        expect(endingView(playing, endLifeGame(fallen, { winner: "a" }), true)).toEqual({ kind: "playing" });
    });

    it("shows a picked winner over what the totals say", () => {
        const picked: GameEnding = { game: 1, phase: "picked", outcome: { winner: "b" } };
        expect(endingView(picked, fallen, true)).toEqual({ kind: "verdict", outcome: { winner: "b" }, picked: true });
        expect(endingView({ game: 1, phase: "picking" }, fallen, true)).toEqual({ kind: "picking" });
    });

    it("plays on while the totals say the same, and shows a verdict that reads differently", () => {
        const playedOn = endingReducer(playing, { type: "play-on", game: 1, outcome: { winner: "a" } });
        expect(endingView(playedOn, fallen, true)).toEqual({ kind: "playing" });
        expect(endingView(playedOn, changeLifeHistory(fallen, 1, 5), true)).toEqual({ kind: "playing" });
        expect(endingView(playedOn, changeLifeHistory(fallen, 0, -20), true)).toEqual({
            kind: "verdict",
            outcome: { draw: true },
            picked: false,
        });
    });
});
