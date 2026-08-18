import { Button, Dialog, DialogActions, DialogBody, DialogTitle, Text } from "components";
import { Fragment } from "react";
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
                <dl className={"grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 gap-y-2"}>
                    {shortcuts.map((shortcut) => (
                        <Fragment key={shortcut.keys}>
                            <dt>
                                <kbd className={"font-sans text-sm text-zinc-500 dark:text-zinc-400"}>
                                    {shortcut.keys}
                                </kbd>
                            </dt>
                            <dd>
                                <Text className={"text-sm"}>{shortcut.description}</Text>
                            </dd>
                        </Fragment>
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
