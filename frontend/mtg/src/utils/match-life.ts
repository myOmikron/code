import type { SetResultRequest } from "src/api/generated";
import type { LifeHistory } from "./life-history";

/**
 * Suggests editable starting life totals for the Match's format and actual table size.
 *
 * @param format selected deck format
 * @param players actual Participants
 * @returns starting life suggestion
 */
export function matchStartingLife(format: string | null | undefined, players: number): number {
    if (format == null) return players === 2 ? 20 : 40;
    if (["commander", "predh"].includes(format)) return 40;
    if (format === "paupercommander") return 30;
    if (format === "standardbrawl") return players === 2 ? 25 : 30;
    if (["brawl", "competitivebrawl"].includes(format)) return 25;
    return 20;
}

/**
 * Keeps a Match's local record separate from other tables and standalone counting.
 *
 * @param tournament Tournament identity
 * @param played Match identity
 * @returns the local history key
 */
export function matchLifeStorageKey(tournament: string, played: string): string {
    return `cardlens.match-life.v1.${tournament}.${played}`;
}

/**
 * Offers recorded Game outcomes as an editable draft; never submits a Result.
 *
 * @param history counted Games, including any unfinished Game
 * @param seats participant ids in Result Seat order
 * @returns a draft only when at least one Game has an explicit outcome
 */
export function lifeResultDraft(history: LifeHistory | null, seats: string[]): SetResultRequest | null {
    const completed = history?.games.filter((game) => game.outcome) ?? [];
    if (!completed.length) return null;
    return {
        games_won: seats.map(
            (seat) =>
                completed.filter((game) => game.outcome && "winner" in game.outcome && game.outcome.winner === seat)
                    .length,
        ),
        games_drawn: completed.filter((game) => game.outcome && "draw" in game.outcome).length,
    };
}
