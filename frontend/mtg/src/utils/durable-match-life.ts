import type { MatchLifeHistory as StoredLifeHistory } from "src/api/generated";
import type { LifeHistory } from "src/utils/life-history";

/**
 * Serialize retained device operation times through the service's timestamp boundary.
 *
 * @param history complete local Match history
 * @returns the typed upload snapshot in a stable property order
 */
export function toMatchLifeHistory(history: LifeHistory): StoredLifeHistory {
    return {
        version: 1,
        games: history.games.map((game) => ({
            players: game.players,
            startingLife: game.startingLife,
            life: game.life,
            damage: game.damage,
            events: game.events.map((event) => ({
                id: event.id,
                kind: event.kind,
                at: new Date(event.at).toISOString(),
                player: event.player,
                commander: event.commander,
                amount: event.amount,
                damageAmount: event.damageAmount,
                corrects: event.corrects,
                reclassifies: event.reclassifies,
            })),
            outcome: game.outcome
                ? "winner" in game.outcome
                    ? { kind: "winner", winner: game.outcome.winner }
                    : { kind: "draw" }
                : undefined,
        })),
    };
}

/**
 * Restore a durable snapshot without replacing original operation times.
 *
 * @param history typed server history
 * @returns the counter's retained local history
 */
export function fromMatchLifeHistory(history: StoredLifeHistory): LifeHistory {
    return {
        version: 1,
        games: history.games.map((game) => ({
            players: game.players,
            startingLife: game.startingLife,
            life: game.life,
            damage: game.damage,
            events: game.events.map((event) => ({
                id: event.id,
                kind: event.kind,
                at: new Date(event.at).getTime(),
                player: event.player ?? undefined,
                commander: event.commander ?? undefined,
                amount: event.amount ?? undefined,
                damageAmount: event.damageAmount ?? undefined,
                corrects: event.corrects ?? undefined,
                reclassifies: event.reclassifies ?? undefined,
            })),
            outcome: game.outcome
                ? game.outcome.kind === "winner"
                    ? { winner: game.outcome.winner }
                    : { draw: true }
                : undefined,
        })),
    };
}
