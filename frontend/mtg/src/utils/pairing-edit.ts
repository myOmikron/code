/**
 * An Organizer's edits to a previewed Round: trade two Participants' places
 * (which also hands the Bye on), or move a Match to another table.
 */

import type { ArrangeRoundRequest, RoundResponse } from "src/api/generated";

/** One Match or Bye while an Organizer edits the Round */
export type EditMatch = {
    /** The Match it started as */
    key: string;
    /** Whether it is a Bye */
    bye: boolean;
    /** Who sits there, in Seat order */
    seats: Array<string>;
    /** Whether it holds the Participants who could play but sit out, see {@link withBench} */
    bench?: true;
};

/** A Round's Matches in table order, then its Byes */
export type EditLayout = Array<EditMatch>;

/**
 * Builds an editable layout from a Round
 *
 * @param round the previewed Round
 *
 * @returns its Matches by table, then its Byes
 */
export function layoutFrom(round: RoundResponse): EditLayout {
    const all = round.matches.map((played) => ({
        key: played.uuid,
        bye: played.table_number == null,
        seats: played.seats.map((seat) => seat.participant),
    }));
    return [...all.filter((entry) => !entry.bye), ...all.filter((entry) => entry.bye)];
}

/**
 * Adds the Participants who could play but sit out, to trade places with
 * those who play: a Top cut entered afterwards seats whom the Organizer says
 *
 * @param layout the layout
 * @param bench who could play but sits nowhere in it
 *
 * @returns the layout with the bench last, the same layout for an empty bench
 */
export function withBench(layout: EditLayout, bench: Array<string>): EditLayout {
    if (bench.length === 0) return layout;
    return [...layout, { key: "bench", bye: true, bench: true, seats: bench }];
}

/**
 * Trades the places of two Participants, at different tables, in one Match or in a Bye
 *
 * @param layout the layout
 * @param a one Participant
 * @param b the other
 *
 * @returns the new layout, or the old one when either sits nowhere
 */
export function swap(layout: EditLayout, a: string, b: string): EditLayout {
    const find = (participant: string) => {
        const entry = layout.findIndex((played) => played.seats.includes(participant));
        return entry < 0 ? null : { entry, seat: layout[entry].seats.indexOf(participant) };
    };
    const first = find(a);
    const second = find(b);
    if (a === b || first === null || second === null) return layout;
    const next = layout.map((played) => ({ ...played, seats: [...played.seats] }));
    next[first.entry].seats[first.seat] = b;
    next[second.entry].seats[second.seat] = a;
    return next;
}

/**
 * Moves a Match one table up or down, trading tables with its neighbour
 *
 * @param layout the layout
 * @param index the position of the Match
 * @param step -1 for one table up, 1 for one table down
 *
 * @returns the new layout, or the old one when there is no Match to trade with
 */
export function moveTable(layout: EditLayout, index: number, step: -1 | 1): EditLayout {
    const target = index + step;
    if (layout[index]?.bye !== false || layout[target]?.bye !== false) return layout;
    const next = [...layout];
    next[index] = layout[target];
    next[target] = layout[index];
    return next;
}

/**
 * Whether a layout differs from the one the edit started from
 *
 * @param before the layout the edit started from
 * @param after the layout now
 *
 * @returns whether saving would change anything
 */
export function isChanged(before: EditLayout, after: EditLayout): boolean {
    return JSON.stringify(toRequest(before)) !== JSON.stringify(toRequest(after));
}

/**
 * A key for an unordered pair of Participants
 *
 * @param a one Participant
 * @param b the other
 *
 * @returns the same key whichever comes first
 */
function pairKey(a: string, b: string): string {
    return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * Who met whom in the Rounds before Round `number`
 *
 * @param rounds every Round
 * @param number the Round being edited
 *
 * @returns the pairs that shared a Match, Byes left out
 */
export function meetingsBefore(rounds: Array<RoundResponse>, number: number): Set<string> {
    const met = new Set<string>();
    for (const round of rounds) {
        if (round.number >= number) continue;
        for (const played of round.matches) {
            if (played.table_number == null) continue;
            const seats = played.seats.map((seat) => seat.participant);
            seats.forEach((a, index) => seats.slice(index + 1).forEach((b) => met.add(pairKey(a, b))));
        }
    }
    return met;
}

/**
 * Whether some Participants of a Match met before
 *
 * @param seats who sits in the Match
 * @param met the pairs from {@link meetingsBefore}
 *
 * @returns whether the Match is a rematch
 */
export function isRematch(seats: Array<string>, met: Set<string>): boolean {
    return seats.some((a, index) => seats.slice(index + 1).some((b) => met.has(pairKey(a, b))));
}

/**
 * The layout as the service takes it
 *
 * @param layout the layout
 *
 * @returns the Matches in table order and the Byes, the bench left out
 */
export function toRequest(layout: EditLayout): ArrangeRoundRequest {
    return {
        matches: layout.filter((entry) => !entry.bye).map((entry) => entry.seats),
        byes: layout.filter((entry) => entry.bye && !entry.bench).flatMap((entry) => entry.seats),
    };
}
