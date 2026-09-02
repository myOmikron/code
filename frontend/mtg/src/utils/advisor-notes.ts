import { Phrase } from "src/api/graph-generated";

/**
 * Splitting a report's notes into what changes how a reader uses the list and
 * what is the engine's own bookkeeping.
 *
 * Half of what the service sends is true on every request — "targets
 * scaled", "209 demoted", "5 promoted" — and shown inline it crowds out the
 * few notes that actually matter this time. Those stay on screen; the rest
 * moves behind a button that also says why the engine does each thing.
 */

/** Codes that narrate how the list was put together rather than the data. */
export const SHAPING_NOTES: ReadonlySet<string> = new Set([
    "bridge-no-gaps",
    "combo-suggestions-capped",
    "combos-below-bracket-three",
    "combos-hidden-below-bracket-four",
    "combos-hidden-no-payoff",
    "deck-size-scaled",
    "demoted-bucket-saturation",
    "demoted-excluded-themes",
    "demoted-type-saturation",
    // Missing EDHREC data is true on every request for that commander —
    // unlike `edhrec-pending`, which stays inline because it announces a
    // refresh about to happen.
    "edhrec-missing",
    "extra-turns-withheld",
    "game-changers-at-cap",
    "game-changers-withheld",
    "mass-land-denial-withheld",
    "promoted-pinned-themes",
    "promoted-seat-theme",
    "promoted-seat-voice",
]);

/**
 * Splits one report's notes into what stays inline and what moves behind the
 * shaping-notes button.
 *
 * An unclassified code is never hidden: only a code this app has explicitly
 * named as bookkeeping moves behind the button, so a note the service adds
 * tomorrow stays exactly where it is today, on screen.
 *
 * @param notes the report's notes, in the order the service sent them
 *
 * @returns the same notes, split into `headline` and `shaping`
 */
export function splitNotes(notes: Array<Phrase>): { headline: Array<Phrase>; shaping: Array<Phrase> } {
    const headline: Array<Phrase> = [];
    const shaping: Array<Phrase> = [];
    for (const note of notes) {
        (SHAPING_NOTES.has(note.code) ? shaping : headline).push(note);
    }
    return { headline, shaping };
}
