import { InformationCircleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle } from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Phrase } from "src/api/graph-generated";
import { say } from "src/utils/advisor-phrase";

/**
 * The properties for {@link DeckAdvisorNotesDialog}
 */
export type DeckAdvisorNotesDialogProps = {
    /** The bookkeeping notes this list was shaped by, see `SHAPING_NOTES` */
    notes: Array<Phrase>;
};

/**
 * The ⓘ button behind which the engine's bookkeeping notes hide, and the
 * dialog that says why it does each thing.
 *
 * "Targets scaled", "209 demoted", "5 promoted" are true on every request —
 * shown inline they crowd out the few notes that change how a reader uses
 * the list this time. One click away instead, with the reason beside each
 * one, rather than either always on screen or nowhere at all.
 *
 * @returns the button, and the dialog once opened; nothing when there is
 *   nothing to explain
 */
export function DeckAdvisorNotesDialog({ notes }: DeckAdvisorNotesDialogProps) {
    const [t] = useTranslation("advisor");
    const [open, setOpen] = useState(false);

    if (notes.length === 0) return null;

    return (
        <>
            <button
                type={"button"}
                onClick={() => setOpen(true)}
                className={"flex items-center gap-1 text-xs text-zinc-500 hover:underline dark:text-zinc-400"}
            >
                <InformationCircleIcon className={"size-3.5"} />
                {t("button.shaping-notes", { count: notes.length })}
            </button>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle className={"flex items-center gap-3"}>
                    <span className={"min-w-0 flex-1"}>{t("heading.shaping-notes")}</span>
                    <Button
                        plain
                        onClick={() => setOpen(false)}
                        aria-label={t("button.assumptions-done")}
                        className={"-mr-2 shrink-0"}
                    >
                        <XMarkIcon className={"size-5"} />
                    </Button>
                </DialogTitle>
                <DialogBody>
                    <p className={"text-sm/6 text-zinc-500 dark:text-zinc-400"}>{t("description.shaping-intro")}</p>

                    <div
                        className={
                            "mt-4 hidden text-xs/5 font-medium text-zinc-500 sm:grid sm:grid-cols-2 sm:gap-6 dark:text-zinc-400"
                        }
                    >
                        <span>{t("label.note-what")}</span>
                        <span>{t("label.note-why")}</span>
                    </div>
                    <div className={"mt-4 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {notes.map((note, index) => (
                            <div key={index} className={"grid gap-1 py-3 sm:grid-cols-2 sm:gap-6"}>
                                <p className={"text-sm text-zinc-950 dark:text-white"}>{say(t, "note", note)}</p>
                                <p className={"text-sm text-zinc-500 dark:text-zinc-400"}>
                                    {t(`description.note-why-${note.code}`, { defaultValue: "" })}
                                </p>
                            </div>
                        ))}
                    </div>
                </DialogBody>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>{t("button.assumptions-done")}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
