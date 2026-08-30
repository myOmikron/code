import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { Dialog, DialogBody, DialogTitle } from "components";
import { useTranslation } from "react-i18next";
import { Button } from "components";

/**
 * Props for {@link DeckAdvisorDoneDialog}
 */
export type DeckAdvisorDoneDialogProps = {
    /** Whether the dialog is open */
    open: boolean;
    /** The target that was just reached, for the copy */
    count: number;
    /** Called when the dialog is dismissed without picking a path */
    onClose: () => void;
    /** Called when the user chooses to start refining */
    onRefine: () => void;
    /** Called when the user chooses to keep adding */
    onAddMore: () => void;
};

/**
 * Celebration dialog shown when the deck reaches its target count from either direction.
 *
 * Offers two paths forward: refine what's already in the deck, or keep adding.
 *
 * @returns the dialog
 */
export function DeckAdvisorDoneDialog({ open, count, onClose, onRefine, onAddMore }: DeckAdvisorDoneDialogProps) {
    const [t] = useTranslation("advisor");

    return (
        <Dialog open={open} onClose={onClose} size="sm">
            <DialogTitle>{t("heading.done")}</DialogTitle>
            <DialogBody>
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                        <CheckCircleIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{t("description.done", { count })}</p>
                    <div className="flex w-full flex-col gap-2">
                        <Button onClick={onRefine} color="blue" className="w-full">
                            {t("button.done-refine")}
                        </Button>
                        <Button onClick={onAddMore} outline className="w-full">
                            {t("button.done-add-more")}
                        </Button>
                    </div>
                </div>
            </DialogBody>
        </Dialog>
    );
}
