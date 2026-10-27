import { Ruleset, TopCut } from "src/api/generated";
import type { FormatRulesResponse } from "src/api/generated";

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

/**
 * The Limited formats a Tournament is played in, besides the deck formats.
 *
 * Draft and Sealed are no deck formats: no deck exists before the Tournament,
 * and what was opened is legal. Mirrors `LIMITED_FORMATS` of the backend's
 * `tournament/settings.rs`, which is what accepts them.
 */
export const LIMITED_FORMATS: ReadonlyArray<string> = ["draft", "sealed"];

/**
 * Whether a Tournament format is one of the {@link LIMITED_FORMATS}
 *
 * @param format the Tournament's format, `null` when it names none
 * @returns `true` for Draft and Sealed
 */
export function isLimited(format: string | null | undefined): boolean {
    return format != null && LIMITED_FORMATS.includes(format);
}

/**
 * The formats a Tournament can be played in: the deck formats, then the Limited ones.
 *
 * @param formats the deck formats on offer
 * @returns their slugs, followed by the {@link LIMITED_FORMATS}
 */
export function tournamentFormats(formats: Array<FormatRulesResponse>): Array<string> {
    return [...formats.map((format) => format.slug), ...LIMITED_FORMATS];
}

/**
 * Suggested Table size and Ruleset for a format.
 *
 * The multiplayer deck formats and no format suggest a Commander table;
 * everything else, Limited included, is played one-on-one.
 *
 * @param format the selected format, or no restriction
 * @returns editable settings suggested for the format
 */
export function formatDefaults(format: string | null): { tableSize: number; ruleset: Ruleset } {
    return format === null || ["commander", "predh", "paupercommander", "oathbreaker"].includes(format)
        ? { tableSize: 4, ruleset: Ruleset.TopDeck }
        : { tableSize: 2, ruleset: Ruleset.Mtr };
}

/** The editable format-dependent Tournament settings. */
export type FormatSettings = { tableSize: number; ruleset: Ruleset };

/** Which settings the Organizer selected deliberately. */
export type ManualFormatSettings = { tableSize: boolean; ruleset: boolean };

/**
 * Apply format suggestions while retaining deliberate settings whenever they remain valid.
 *
 * @param current the settings currently shown
 * @param format the selected format
 * @param manual which fields were deliberately selected or loaded for editing
 * @returns settings compatible with the Table size
 */
export function withFormatDefaults(
    current: FormatSettings,
    format: string | null,
    manual: ManualFormatSettings,
): { tableSize: number; ruleset: Ruleset } {
    const defaults = formatDefaults(format);
    const tableSize = manual.tableSize ? current.tableSize : defaults.tableSize;
    const ruleset =
        manual.ruleset && rulesetFits(current.ruleset, tableSize) ? current.ruleset : rulesetsFor(tableSize)[0];
    return { tableSize, ruleset };
}
