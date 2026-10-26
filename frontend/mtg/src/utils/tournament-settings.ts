import { Ruleset, TopCut } from "src/api/generated";

/** The Table sizes a Tournament can be played at, smallest first */
export const TABLE_SIZES: Array<number> = [2, 3, 4, 5];

/**
 * The Rulesets a Tournament at this Table size may follow
 *
 * Mirrors the service's check, so the settings form only offers what it would accept.
 *
 * @param tableSize how many Participants a full Match seats
 *
 * @returns the Rulesets in the order they are offered
 */
export function rulesetsFor(tableSize: number): Array<Ruleset> {
    return tableSize === 2 ? [Ruleset.Mtr] : [Ruleset.TopDeck, Ruleset.MultiplayerAddendum];
}

/**
 * Whether a Ruleset is played at this Table size
 *
 * @param ruleset the Ruleset
 * @param tableSize how many Participants a full Match seats
 *
 * @returns whether the two go together
 */
export function rulesetFits(ruleset: Ruleset, tableSize: number): boolean {
    return rulesetsFor(tableSize).includes(ruleset);
}

/**
 * The Top cuts a Tournament at this Table size may end with
 *
 * Mirrors the service's check: a bracket one-on-one, one final Match multiplayer.
 *
 * @param tableSize how many Participants a full Match seats
 *
 * @returns the Top cuts in the order they are offered
 */
export function topCutsFor(tableSize: number): Array<TopCut> {
    return tableSize === 2 ? [TopCut.Top4, TopCut.Top8] : [TopCut.Final];
}

/**
 * An instant as a `datetime-local` field shows it, in the reader's time zone
 *
 * @param instant the point in time
 *
 * @returns `YYYY-MM-DDTHH:mm`
 */
export function toLocalInput(instant: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return (
        `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
        `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    );
}

/**
 * The instant a `datetime-local` field holds, read in the reader's time zone
 *
 * @param value `YYYY-MM-DDTHH:mm`
 *
 * @returns the point in time
 */
export function fromLocalInput(value: string): Date {
    return new Date(value);
}
