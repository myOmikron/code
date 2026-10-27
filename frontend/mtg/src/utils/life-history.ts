import { emptyCommanderDamage, REBOOK_REACTION, REBOOK_LINGER } from "./life-tracker";

/** A stable identity and display name, in Seat order. */
export type LifePlayer = { id: string; name: string };
/** An explicitly recorded Game outcome, independent of a Tournament Result. */
export type LifeOutcome = { winner: string } | { draw: true };
/** One retained operation, with affected players and the life/damage adjustment. */
export type LifeEvent = {
    id: string;
    kind: "start" | "life" | "commander" | "reclassify" | "correction" | "end";
    at: number;
    player?: string;
    commander?: string;
    amount?: number;
    damageAmount?: number;
    corrects?: string;
    reclassifies?: string[];
};
/** A Game with its original totals, current table and retained operations. */
export type LifeGame = {
    players: LifePlayer[];
    startingLife: number[];
    life: number[];
    damage: number[][];
    events: LifeEvent[];
    outcome?: LifeOutcome;
};
/** The complete local or Match counting record. */
export type LifeHistory = { version: 1; games: LifeGame[] };
/** Browser storage boundary, injectable when another persistence layer owns the history. */
export type LifeStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Creates a history with the first Game ready to count.
 *
 * @param players participants in Seat order
 * @param totals starting life totals in Seat order
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function createLifeHistory(players: LifePlayer[], totals: number[], at = Date.now()): LifeHistory {
    return {
        version: 1,
        games: [
            {
                players,
                startingLife: [...totals],
                life: [...totals],
                damage: emptyCommanderDamage(players.length),
                events: [{ id: crypto.randomUUID(), kind: "start", at }],
            },
        ],
    };
}

/**
 * Adds a fresh Game only after the previous Game has explicitly ended.
 *
 * @param history complete counting record
 * @param players participants in Seat order
 * @param totals starting life totals in Seat order
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function nextLifeGame(
    history: LifeHistory,
    players: LifePlayer[],
    totals: number[],
    at = Date.now(),
): LifeHistory {
    if (!history.games.at(-1)?.outcome) return history;
    return { ...history, games: [...history.games, ...createLifeHistory(players, totals, at).games] };
}

/**
 * Retains the chosen winner or draw and closes counting for this Game.
 *
 * @param history complete counting record
 * @param outcome explicit winner or draw
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function endLifeGame(history: LifeHistory, outcome: LifeOutcome, at = Date.now()): LifeHistory {
    const game = history.games.at(-1)!;
    if (game.outcome || ("winner" in outcome && !game.players.some((player) => player.id === outcome.winner)))
        return history;
    return {
        ...history,
        games: [
            ...history.games.slice(0, -1),
            { ...game, outcome, events: [...game.events, { id: crypto.randomUUID(), kind: "end", at }] },
        ],
    };
}

/**
 * Records a life change to the current Game.
 *
 * @param history complete counting record
 * @param player affected Seat index
 * @param amount signed change
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function changeLifeHistory(history: LifeHistory, player: number, amount: number, at = Date.now()): LifeHistory {
    const game = history.games.at(-1)!;
    if (game.outcome || !game.players[player] || !Number.isSafeInteger(amount) || !amount) return history;
    return {
        ...history,
        games: [
            ...history.games.slice(0, -1),
            {
                ...game,
                life: game.life.map((total, index) => (index === player ? total + amount : total)),
                events: [
                    ...game.events,
                    { id: crypto.randomUUID(), kind: "life", at, player: game.players[player].id, amount },
                ],
            },
        ],
    };
}

/**
 * Writes immediately without letting unavailable browser storage stop counting.
 *
 * @param key device storage key
 * @param history complete counting record
 * @param storage optional browser storage boundary
 */
export function saveLifeHistory(key: string, history: LifeHistory, storage?: LifeStorage): void {
    try {
        (storage ?? localStorage).setItem(key, JSON.stringify(history));
    } catch {
        return;
    }
}

/**
 * Restores complete history without expiring earlier Games.
 *
 * @param key device storage key
 * @param storage optional browser storage boundary
 * @returns restored history, or null when unavailable or invalid
 */
export function loadLifeHistory(key: string, storage?: LifeStorage): LifeHistory | null {
    try {
        const history = JSON.parse((storage ?? localStorage).getItem(key) ?? "null") as LifeHistory | null;
        if (history?.version !== 1 || !Array.isArray(history.games) || !history.games.length) return null;
        for (const game of history.games) {
            const count = game.players.length;
            if (
                !count ||
                count > 6 ||
                !game.players.every((player) => typeof player.id === "string" && typeof player.name === "string") ||
                new Set(game.players.map((player) => player.id)).size !== count
            )
                return null;
            if (
                ![game.life, game.startingLife].every(
                    (totals) => totals.length === count && totals.every(Number.isSafeInteger),
                )
            )
                return null;
            if (
                game.damage.length !== count ||
                !game.damage.every(
                    (row) => row.length === count && row.every((value) => Number.isSafeInteger(value) && value >= 0),
                )
            )
                return null;
            const ids = new Set(game.players.map((player) => player.id));
            if (
                game.outcome &&
                !("draw" in game.outcome && game.outcome.draw === true) &&
                !("winner" in game.outcome && ids.has(game.outcome.winner))
            )
                return null;
            if (
                !game.events.length ||
                game.events[0].kind !== "start" ||
                new Set(game.events.map((event) => event.id)).size !== game.events.length
            )
                return null;
            if (
                !game.events.every(
                    (event) =>
                        (event.player === undefined || ids.has(event.player)) &&
                        (event.commander === undefined || ids.has(event.commander)) &&
                        (event.amount === undefined || Number.isSafeInteger(event.amount)) &&
                        (event.damageAmount === undefined || Number.isSafeInteger(event.damageAmount)) &&
                        (event.reclassifies === undefined ||
                            (Array.isArray(event.reclassifies) &&
                                event.reclassifies.every((id) =>
                                    game.events.some((entry) => entry.id === id && entry.kind === "life"),
                                ))),
                )
            )
                return null;
            if (
                !Array.isArray(game.events) ||
                !game.events.every(
                    (event) =>
                        typeof event.id === "string" &&
                        Number.isFinite(event.at) &&
                        ["start", "life", "commander", "reclassify", "correction", "end"].includes(event.kind),
                )
            )
                return null;
        }
        return history;
    } catch {
        return null;
    }
}

/**
 * Combines adjacent taps for display, leaving original operations intact.
 *
 * @param events retained operations
 * @returns readable groups
 */
export function groupLifeEvents(events: LifeEvent[]): Array<LifeEvent & { ids: string[] }> {
    const grouped: Array<LifeEvent & { ids: string[] }> = [];
    for (const event of events) {
        const previous = grouped.at(-1);
        if (
            previous &&
            ["life", "commander"].includes(event.kind) &&
            previous.kind === event.kind &&
            previous.player === event.player &&
            previous.commander === event.commander &&
            Math.sign(previous.amount ?? 0) === Math.sign(event.amount ?? 0) &&
            event.at - previous.at <= REBOOK_REACTION
        ) {
            grouped[grouped.length - 1] = {
                ...previous,
                ids: [...previous.ids, event.id],
                at: event.at,
                amount: (previous.amount ?? 0) + (event.amount ?? 0),
                damageAmount: (previous.damageAmount ?? 0) + (event.damageAmount ?? 0),
            };
        } else grouped.push({ ...event, ids: [event.id] });
    }
    return grouped;
}

/**
 * Retains a compensating change rather than removing the original operation.
 *
 * @param history complete counting record
 * @param id operation being corrected
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function correctLifeEvent(history: LifeHistory, id: string, at = Date.now()): LifeHistory {
    const game = history.games.at(-1)!;
    let event = game.events.find((entry) => entry.id === id);
    if (
        game.outcome ||
        !event?.player ||
        !["life", "commander", "reclassify"].includes(event.kind) ||
        game.events.some((entry) => entry.corrects === id)
    )
        return history;
    if (event.kind === "life") {
        const classification = game.events.find(
            (entry) =>
                entry.reclassifies?.includes(id) && !game.events.some((correction) => correction.corrects === entry.id),
        );
        if (classification) event = { ...event, commander: classification.commander, damageAmount: -event.amount! };
    } else if (event.kind === "reclassify") {
        const alreadyCorrected = game.events
            .filter((entry) => entry.corrects && event!.reclassifies?.includes(entry.corrects))
            .reduce((total, entry) => total + (entry.damageAmount ?? 0), 0);
        event = { ...event, damageAmount: (event.damageAmount ?? 0) + alreadyCorrected };
        if (!event.damageAmount) return history;
    }
    const player = game.players.findIndex((entry) => entry.id === event.player);
    const commander = game.players.findIndex((entry) => entry.id === event.commander);
    if (commander >= 0 && game.damage[player][commander] < (event.damageAmount ?? 0)) return history;
    const correction: LifeEvent = {
        id: crypto.randomUUID(),
        kind: "correction",
        at,
        player: event.player,
        commander: event.commander,
        corrects: id,
        amount: -(event.amount ?? 0),
        damageAmount: -(event.damageAmount ?? 0),
    };
    return {
        ...history,
        games: [
            ...history.games.slice(0, -1),
            {
                ...game,
                life: game.life.map((total, index) => (index === player ? total + correction.amount! : total)),
                damage: game.damage.map((row, index) =>
                    index === player
                        ? row.map((value, opponent) =>
                              opponent === commander ? value + correction.damageAmount! : value,
                          )
                        : row,
                ),
                events: [...game.events, correction],
            },
        ],
    };
}

/**
 * Books commander damage, or reclassifies a recent unbooked run without charging life again.
 *
 * @param history complete counting record
 * @param player affected Seat index
 * @param commander source Seat index
 * @param amount signed change
 * @param reclassify whether life was already deducted
 * @param at operation time in milliseconds
 * @returns the resulting record
 */
export function changeCommanderHistory(
    history: LifeHistory,
    player: number,
    commander: number,
    amount: number,
    reclassify = false,
    at = Date.now(),
): LifeHistory {
    const game = history.games.at(-1)!;
    if (game.outcome || !game.players[player] || !game.players[commander] || !Number.isSafeInteger(amount) || !amount)
        return history;
    const reclassifies: string[] = [];
    if (reclassify) {
        let available = 0;
        let last = at;
        for (const event of [...game.events].reverse()) {
            if (event.player !== game.players[player].id) continue;
            if (
                event.kind !== "life" ||
                (event.amount ?? 0) >= 0 ||
                last - event.at > (available === 0 ? REBOOK_REACTION + REBOOK_LINGER : REBOOK_REACTION)
            )
                break;
            reclassifies.push(event.id);
            available -= event.amount!;
            last = event.at;
        }
        if (amount <= 0 || amount !== available) return history;
    }
    const damageAmount = Math.max(0, game.damage[player][commander] + amount) - game.damage[player][commander];
    if (!damageAmount) return history;
    const lifeAmount = reclassify ? 0 : -damageAmount;
    const event: LifeEvent = {
        id: crypto.randomUUID(),
        kind: reclassify ? "reclassify" : "commander",
        at,
        player: game.players[player].id,
        commander: game.players[commander].id,
        amount: lifeAmount,
        damageAmount,
        ...(reclassify ? { reclassifies } : {}),
    };
    return {
        ...history,
        games: [
            ...history.games.slice(0, -1),
            {
                ...game,
                life: game.life.map((total, index) => (index === player ? total + lifeAmount : total)),
                damage: game.damage.map((row, index) =>
                    index === player
                        ? row.map((value, opponent) => (opponent === commander ? value + damageAmount : value))
                        : row,
                ),
                events: [...game.events, event],
            },
        ],
    };
}
