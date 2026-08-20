import { InformationCircleIcon } from "@heroicons/react/20/solid";

/**
 * The properties for {@link DeckAdvisorNotes}
 */
export type DeckAdvisorNotesProps = {
    /** What the service said about this answer, empty when it said nothing */
    notes?: Array<string>;
};

/**
 * What the advisor wants said about an answer before it is trusted.
 *
 * The service emits these deliberately — "the nominated commander was
 * rejected, so one was inferred", "EDHREC has no statistics for this
 * commander", "combo lookup unavailable" — and each one is the difference
 * between a report the user can read correctly and one that quietly misleads.
 * They are shown as prose, in the service's own words, like card names.
 *
 * @returns the note list, or nothing when there is nothing to say
 */
export function DeckAdvisorNotes({ notes }: DeckAdvisorNotesProps) {
    if (notes === undefined || notes.length === 0) return null;

    return (
        <ul className={"flex flex-col gap-1"}>
            {notes.map((note) => (
                <li key={note} className={"flex items-start gap-1.5 text-xs/5 text-zinc-500 dark:text-zinc-400"}>
                    <InformationCircleIcon className={"mt-0.5 size-3.5 shrink-0"} />
                    <span>{note}</span>
                </li>
            ))}
        </ul>
    );
}
