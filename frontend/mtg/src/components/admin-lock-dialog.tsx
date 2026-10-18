import { useForm } from "@tanstack/react-form";
import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogTitle,
    ErrorMessage,
    Field,
    FieldGroup,
    Form,
    Label,
    RequiredLabel,
    Textarea,
} from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { AdminAccount } from "src/api/generated";
import { isFormError } from "src/utils/error";

/** The longest reason the backend accepts */
const REASON_MAX_LENGTH = 1024;

/**
 * The properties for {@link AdminLockDialog}
 */
export type AdminLockDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The Account to Lock, or to unlock when it is locked already */
    account: AdminAccount;
    /** Called when the dialog should close without having changed anything */
    onClose: () => void;
    /** Called after the Lock was set or lifted */
    onDone: () => void;
};

/**
 * Dialog for locking an Account, or lifting its Lock.
 *
 * A Lock needs a reason, an unlock may give one. Only Admins ever read either.
 *
 * @returns the dialog
 */
export function AdminLockDialog({ open, account, onClose, onDone }: AdminLockDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const unlocking = account.lock !== null && account.lock !== undefined;

    const form = useForm({
        defaultValues: { reason: "" },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const reason = value.reason.trim();
                if (unlocking) {
                    const response = await Api.admin.accounts.unlock(account.uuid, reason === "" ? undefined : reason);
                    if (isFormError(response)) return { form: t("error.not-locked") };
                } else {
                    if (reason === "") return { fields: { reason: t("error.reason-missing") }, form: undefined };
                    const response = await Api.admin.accounts.lock(account.uuid, reason);
                    if (isFormError(response)) {
                        const { error } = response;
                        if (error.own_account) return { form: t("error.own-lock") };
                        if (error.reason_missing)
                            return { fields: { reason: t("error.reason-missing") }, form: undefined };
                        return { form: t("error.already-locked") };
                    }
                }
                onDone();
            },
        },
    });

    useEffect(() => {
        form.reset({ reason: "" });
    }, [open, unlocking]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{unlocking ? t("heading.unlock") : t("heading.lock")}</DialogTitle>
            <DialogDescription>
                {t(unlocking ? "description.unlock" : "description.lock", { username: account.username })}
            </DialogDescription>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"reason"}>
                            {(fieldApi) => (
                                <Field>
                                    {unlocking ? (
                                        <Label>{t("label.unlock-reason")}</Label>
                                    ) : (
                                        <RequiredLabel>{t("label.lock-reason")}</RequiredLabel>
                                    )}
                                    <Description>{t("description.reason")}</Description>
                                    <Textarea
                                        autoFocus={true}
                                        rows={3}
                                        required={!unlocking}
                                        maxLength={REASON_MAX_LENGTH}
                                        invalid={fieldApi.state.meta.errors.length > 0}
                                        value={fieldApi.state.value}
                                        onChange={(event) => fieldApi.handleChange(event.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((error) => (
                                        <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>
                        <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                            {(error) => {
                                const message =
                                    typeof error === "object" && error !== null && "form" in error
                                        ? (error.form as string | undefined)
                                        : undefined;
                                return message === undefined ? null : <ErrorMessage>{message}</ErrorMessage>;
                            }}
                        </form.Subscribe>
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                        {(submitting) => (
                            <Button type={"submit"} color={unlocking ? "blue" : "red"} disabled={submitting}>
                                {unlocking ? t("button.unlock") : t("button.lock")}
                            </Button>
                        )}
                    </form.Subscribe>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
