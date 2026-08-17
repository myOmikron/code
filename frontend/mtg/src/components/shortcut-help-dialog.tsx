import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { useTranslation } from "react-i18next";

/**
 * The properties for {@link ShortcutHelpDialog}
 */
export type ShortcutHelpDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The keys and what they do */
    shortcuts: Array<{ keys: string; description: string }>;
    /** Closes the dialog */
    onClose: () => void;
};

/**
 * What the keyboard can do on this page.
 *
 * Reachable with `?`, which is where everyone looks for it.
 *
 * @returns the dialog
 */
export function ShortcutHelpDialog({ open, shortcuts, onClose }: ShortcutHelpDialogProps) {
    const [t] = useTranslation("deck");
    const [tg] = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} size={"md"}>
            <DialogTitle>{t("heading.shortcuts")}</DialogTitle>
            <DialogBody>
                <dl className={"flex flex-col gap-2"}>
                    {shortcuts.map((shortcut) => (
                        <div key={shortcut.keys} className={"flex items-center justify-between gap-4"}>
                            <dt>
                                <kbd
                                    className={
                                        "rounded-(--radius-control) bg-zinc-950/5 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                                    }
                                >
                                    {shortcut.keys}
                                </kbd>
                            </dt>
                            <dd className={"min-w-0 flex-1 text-right"}>
                                <Text className={"text-sm"}>{shortcut.description}</Text>
                            </dd>
                        </div>
                    ))}
                </dl>
            </DialogBody>
            <DialogActions>
                <Button plain onClick={onClose}>
                    {tg("button.close")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
