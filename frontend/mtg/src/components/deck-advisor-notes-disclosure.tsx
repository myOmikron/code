import { ChevronRightIcon, InformationCircleIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeckAdvisorNotes } from "src/components/deck-advisor-notes";

/**
 * The properties for {@link DeckAdvisorNotesDisclosure}
 */
export type DeckAdvisorNotesDisclosureProps = {
    /** What the service said about this answer, already localized */
    notes: Array<string>;
};

/**
 * The trust caveats, folded away behind a toggle instead of said up front.
 *
 * "EDHREC has no data for this commander" and "targets are scaled" are true
 * every time a fill runs, so stated in full they crowd out the one thing that
 * changed: the meters above. Collapsed by default, they are one click away
 * rather than gone — the fill dialog is exactly where those caveats bear on
 * what a reader is about to accept.
 *
 * @returns the toggle, and the notes once it is open
 */
export function DeckAdvisorNotesDisclosure({ notes }: DeckAdvisorNotesDisclosureProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState(false);

    if (notes.length === 0) return null;

    return (
        <div>
            <button
                type={"button"}
                aria-expanded={open}
                onClick={() => setOpen((held) => !held)}
                className={"flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"}
            >
                <InformationCircleIcon className={"size-3.5"} />
                {t("button.fill-notes", { count: notes.length })}
                <ChevronRightIcon
                    className={clsx("size-3 transition-transform", open && "rotate-90")}
                    aria-hidden={true}
                />
            </button>
            {open && (
                <div className={"mt-1"}>
                    <DeckAdvisorNotes notes={notes} />
                </div>
            )}
        </div>
    );
}
