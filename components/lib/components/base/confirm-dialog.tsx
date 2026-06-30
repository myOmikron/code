import React from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "./dialog";
import { Button } from "./button";

/**
 * Allowed colors for the confirm button in a {@link ConfirmDialog}.
 */
type ButtonColor = "red" | "blue" | "amber" | "emerald" | "sky" | "indigo" | "zinc";

/**
 * The properties for {@link ConfirmDialog}
 */
export type ConfirmDialogProps = {
    /** Whether the dialog is open. */
    open: boolean;
    /** Called when the dialog is dismissed (cancel button or backdrop click). */
    onClose: () => void;
    /**
     * Called when the confirm button is pressed. May return a promise — the
     * confirm button shows a loading state while it resolves.
     */
    onConfirm: () => void | Promise<unknown>;
    /** Headline of the dialog. */
    title: string;
    /** Optional supportive text under the title. */
    description?: React.ReactNode;
    /** Label for the destructive/confirming action. Defaults to translation key `button.confirm`. */
    confirmLabel?: string;
    /** Label for the cancel button. Defaults to translation key `button.cancel`. */
    cancelLabel?: string;
    /** Color of the confirm button. Default `red` for destructive actions. */
    confirmColor?: ButtonColor;
    /** Pass-through size for the underlying `<Dialog>`. */
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
    /** Optional extra body content rendered between description and actions. */
    children?: React.ReactNode;
};

/**
 * A generic confirmation dialog with built-in loading state on the confirm
 * button. Designed for delete/expire/disable confirmations.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete item?"
 *   description="This action cannot be undone."
 * />
 * ```
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
    const {
        open,
        onClose,
        onConfirm,
        title,
        description,
        confirmLabel,
        cancelLabel,
        confirmColor = "red",
        size = "lg",
        children,
    } = props;
    const [tg] = useTranslation();
    const [loading, setLoading] = React.useState(false);

    /** Executes onConfirm and manages the loading state. */
    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={loading ? () => undefined : onClose} size={size}>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
            {children}
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    {cancelLabel ?? tg("button.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button color={confirmColor} loading={loading} onClick={handleConfirm}>
                    {confirmLabel ?? tg("button.confirm", { defaultValue: "Confirm" })}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
