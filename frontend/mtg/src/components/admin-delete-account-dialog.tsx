import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    Field,
    Input,
    Label,
    Radio,
    RadioField,
    RadioGroup,
    notify,
} from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { DeletionMode } from "src/api/generated";
import type { AdminAccount } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import { isFormError } from "src/utils/error";

/**
 * The properties for {@link AdminDeleteAccountDialog}
 */
export type AdminDeleteAccountDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The Account to delete */
    account: AdminAccount;
    /** Closes the dialog */
    onClose: () => void;
    /** Called once the Account is gone */
    onDeleted: () => void | Promise<void>;
};

/**
 * The confirmation in front of an Admin deleting an Account.
 *
 * The Admin chooses what happens to the public decks, handing them to the
 * Tombstone unless asked otherwise, and types the Account's username.
 *
 * @returns the dialog
 */
export function AdminDeleteAccountDialog({ open, account, onClose, onDeleted }: AdminDeleteAccountDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const [mode, setMode] = useState<DeletionMode>(DeletionMode.Tombstone);
    const [typed, setTyped] = useState("");
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setMode(DeletionMode.Tombstone);
        setTyped("");
        setMessage(undefined);
    }, [open]);

    const matches = typed.trim().toLowerCase() === account.username.toLowerCase();

    /**
     * Deletes the Account and hands over to the caller
     */
    async function remove() {
        setBusy(true);
        setMessage(undefined);

        let refusal: string | undefined;
        try {
            await notify.promise(
                (async () => {
                    const response = await Api.admin.accounts.delete(account.uuid, typed.trim(), mode);
                    if (isFormError(response)) {
                        refusal = response.error.own_account ? t("error.own-deletion") : t("error.username-mismatch");
                        throw new Error("the deletion was refused");
                    }
                })(),
                {
                    pending: t("toast.deleting"),
                    success: t("toast.deleted"),
                    error: t("toast.not-deleted"),
                },
            );
        } catch {
            setMessage(refusal ?? t("error.delete-failed"));
            return;
        } finally {
            setBusy(false);
        }

        onClose();
        await onDeleted();
    }

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.delete")}</DialogTitle>
            <DialogDescription>{t("description.delete", { username: account.username })}</DialogDescription>
            <DialogBody>
                <div className={"flex flex-col gap-6"}>
                    <RadioGroup value={mode} onChange={(next: string) => setMode(next as DeletionMode)}>
                        <RadioField>
                            <Radio value={DeletionMode.Tombstone} color={"blue"} />
                            <Label>{t("label.deletion-tombstone")}</Label>
                            <Description>{t("description.deletion-tombstone")}</Description>
                        </RadioField>
                        <RadioField>
                            <Radio value={DeletionMode.Full} color={"blue"} />
                            <Label>{t("label.deletion-full")}</Label>
                            <Description>{t("description.deletion-full")}</Description>
                        </RadioField>
                    </RadioGroup>
                    <Field>
                        <Label>{t("label.delete-confirm", { username: account.username })}</Label>
                        <Input autoComplete={"off"} value={typed} onChange={(event) => setTyped(event.target.value)} />
                    </Field>
                    {message !== undefined && <InlineError>{message}</InlineError>}
                </div>
            </DialogBody>
            <DialogActions>
                <Button plain type={"button"} onClick={onClose}>
                    {tg("button.cancel")}
                </Button>
                <Button color={"red"} disabled={!matches || busy} onClick={() => void remove()}>
                    {t("button.delete")}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
