import type { LifeGame, LifeHistory, LifeOutcome } from "./life-history";
import { isEliminated } from "./life-tracker";

/**
 * Where ending one Game stands.
 *
 * `game` is the Game's number in its history: once another Game is played,
 * whatever was going on with this one no longer applies.
 */
export type GameEnding =
    | { game: number; phase: "playing" }
    | { game: number; phase: "picking" }
    | { game: number; phase: "picked"; outcome: LifeOutcome }
    | { game: number; phase: "played-on"; outcome: LifeOutcome };

/** What the table does about ending a Game */
export type EndingAction =
    | { type: "pick"; game: number }
    | { type: "choose"; game: number; outcome: LifeOutcome }
    | { type: "back"; game: number }
    | { type: "cancel"; game: number }
    | { type: "play-on"; game: number; outcome: LifeOutcome };

/** What the tiles show about ending the Game being played */
export type EndingView =
    { kind: "playing" } | { kind: "picking" } | { kind: "verdict"; outcome: LifeOutcome; picked: boolean };

/**
 * Moves the ending on; a step that does not fit where it stands changes nothing.
 *
 * @param ending where it stands
 * @param action what the table did
 * @returns where it stands now
 */
export function endingReducer(ending: GameEnding, action: EndingAction): GameEnding {
    const current: GameEnding = ending.game === action.game ? ending : { game: action.game, phase: "playing" };
    const game = action.game;
    switch (action.type) {
        case "pick":
            return current.phase === "picking" ? current : { game, phase: "picking" };
        case "choose":
            return current.phase === "picking" ? { game, phase: "picked", outcome: action.outcome } : current;
        case "back":
            return current.phase === "picked" ? { game, phase: "picking" } : current;
        case "cancel":
            return current.phase === "picking" || current.phase === "picked" ? { game, phase: "playing" } : current;
        case "play-on":
            return current.phase === "playing" ? { game, phase: "played-on", outcome: action.outcome } : current;
    }
}

/**
 * Who the life totals say won, once at most one player is left standing
 *
 * @param game the Game being played
 * @returns the last player standing, a draw when nobody is, `undefined` while several are
 */
export function lifeOutcome(game: LifeGame): LifeOutcome | undefined {
    if (game.players.length < 2) return undefined;
    const standing = game.players.filter((_, index) => !isEliminated(game.life[index], game.damage[index]));
    if (standing.length > 1) return undefined;
    return standing.length === 1 ? { winner: standing[0].id } : { draw: true };
}

/**
 * Whether two outcomes say the same
 *
 * @param a one outcome
 * @param b the other
 * @returns whether both are the same winner, or both a draw
 */
function sameOutcome(a: LifeOutcome, b: LifeOutcome): boolean {
    return "draw" in a ? "draw" in b : "winner" in b && a.winner === b.winner;
}

/**
 * What the tiles show about ending the Game being played.
 *
 * Playing on holds for as long as the life totals say what they said when the
 * table chose to: a verdict that would read differently comes back.
 *
 * @param ending where ending it stands
 * @param history the Match so far, the Game being played last
 * @param counting whether this device counts a Match, so a Game ends with an outcome
 * @returns the view
 */
export function endingView(ending: GameEnding, history: LifeHistory, counting: boolean): EndingView {
    const game = history.games.at(-1)!;
    if (!counting || game.outcome) return { kind: "playing" };
    const current: GameEnding =
        ending.game === history.games.length ? ending : { game: history.games.length, phase: "playing" };
    if (current.phase === "picking") return { kind: "picking" };
    if (current.phase === "picked") return { kind: "verdict", outcome: current.outcome, picked: true };
    const outcome = lifeOutcome(game);
    if (!outcome || (current.phase === "played-on" && sameOutcome(outcome, current.outcome))) {
        return { kind: "playing" };
    }
    return { kind: "verdict", outcome, picked: false };
}
