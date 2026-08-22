import { XMarkIcon } from "@heroicons/react/20/solid";
import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useTranslation } from "react-i18next";
import { IgnoredCard } from "src/utils/deck-ignore";

/**
 * The properties for {@link DeckIgnoreDialog}
 */
export type DeckIgnoreDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** Puts the dialog away */
    onClose: () => void;
    /** The cards the advisor must never suggest for this deck */
    ignored: Array<IgnoredCard>;
    /** Records the list with one card let back in */
    onUnignore: (card: IgnoredCard) => void;
};

/**
 * The deck's ignore list, with a way back in for every card on it.
 *
 * @returns the dialog
 */
export function DeckIgnoreDialog({ open, onClose, ignored, onUnignore }: DeckIgnoreDialogProps) {
    const [t] = useTranslation("advisor");

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.ignored")}</DialogTitle>
            <DialogBody>
                <Text>{t("description.ignored")}</Text>
                {ignored.length === 0 ? (
                    <Text className={"mt-4"}>{t("description.ignored-empty")}</Text>
                ) : (
                    <div className={"mt-2 divide-y divide-zinc-950/5 dark:divide-white/10"}>
                        {ignored.map((card) => (
                            <div key={card.oracle_id} className={"flex items-center gap-3 py-1.5"}>
                                <span
                                    className={
                                        "min-w-0 flex-1 truncate text-sm font-medium text-zinc-950 dark:text-white"
                                    }
                                >
                                    {card.name}
                                </span>
                                <button
                                    type={"button"}
                                    title={t("accessibility.unignore-card", { name: card.name })}
                                    aria-label={t("accessibility.unignore-card", { name: card.name })}
                                    onClick={() => onUnignore(card)}
                                    className={
                                        "rounded p-1 text-zinc-500 transition hover:bg-zinc-950/10 dark:text-zinc-400 dark:hover:bg-white/10"
                                    }
                                >
                                    <XMarkIcon className={"size-4"} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </DialogBody>
            <DialogActions>
                <Button onClick={onClose}>{t("button.ignored-done")}</Button>
            </DialogActions>
        </Dialog>
    );
}
