import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Input,
    Label,
    Text,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import { isFormError } from "src/utils/error";

/**
 * The properties for {@link DeleteAccountDialog}
 */
export type DeleteAccountDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The username of the account that would be deleted */
    username: string;
    /** Closes the dialog */
    onClose: () => void;
    /** Called once the account is gone */
    onDeleted: () => void | Promise<void>;
};

/**
 * The confirmation in front of deleting one's own account.
 *
 * The username has to be typed out. A red button alone is a click; a name
 * spelled into a field is a decision, and this one cannot be taken back.
 *
 * @returns the dialog
 */
export function DeleteAccountDialog({ open, username, onClose, onDeleted }: DeleteAccountDialogProps) {
    const [t] = useTranslation("profile");
    const [tg] = useTranslation();
    const [typed, setTyped] = useState("");
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setTyped("");
        setMessage(undefined);
    }, [open]);

    const matches = typed.trim().toLowerCase() === username.toLowerCase();

    /**
     * Deletes the account and hands over to the caller.
     *
     * The request cascades through everything the account owns, so it can take
     * a moment. A toast rather than a spinner on the button: the dialog closes
     * on success and the page navigates away, and the toast outlives both.
     */
    async function remove() {
        setBusy(true);
        setMessage(undefined);

        let mismatch = false;
        try {
            await notify.promise(
                (async () => {
                    const response = await Api.accounts.delete(typed.trim());
                    if (isFormError(response)) {
                        mismatch = true;
                        throw new Error("the typed username is not the account's");
                    }
                })(),
                {
                    pending: t("toast.deleting-account"),
                    success: t("toast.account-deleted"),
                    error: t("toast.account-not-deleted"),
                },
            );
        } catch {
            setMessage(mismatch ? t("error.username-mismatch") : t("error.delete-failed"));
            return;
        } finally {
            setBusy(false);
        }

        onClose();
        await onDeleted();
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.delete-account-confirm")}</DialogTitle>
            <DialogDescription>{t("description.delete-account-confirm")}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-4"}>
                    <Text>{t("description.delete-account-decks")}</Text>
                    <Field>
                        <Label>{t("label.delete-account-confirm", { username })}</Label>
                        <Input
                            autoFocus={true}
                            autoComplete={"off"}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                        />
                    </Field>
                    {message !== undefined && <InlineError>{message}</InlineError>}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain type={"button"} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button color={"red"} disabled={!matches || busy} onClick={() => void remove()}>
                    {t("button.delete-account")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
