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
    RequiredLabel,
    Textarea,
} from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { AdminAccount } from "src/api/generated";
import { handleFormError, isFormError, type ValidationErrors } from "src/utils/error";

/** The longest reason the backend accepts */
const REASON_MAX_LENGTH = 1024;

/**
 * The properties for {@link AdminImpersonateDialog}
 */
export type AdminImpersonateDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The Member Account to impersonate */
    account: AdminAccount;
    /** Called when the dialog should close without having started anything */
    onClose: () => void;
    /** Called after the Impersonation started */
    onDone: () => void;
};

/**
 * Dialog for an Admin starting an Impersonation of a Member Account.
 *
 * Takes the Impersonation reason, which only Admins ever read; the Account is not told.
 *
 * @returns the dialog
 */
export function AdminImpersonateDialog({ open, account, onClose, onDone }: AdminImpersonateDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: { reason: "" },
        validators: {
            onSubmitAsync: async ({ value }): Promise<ValidationErrors | undefined> => {
                const reason = value.reason.trim();
                if (reason === "") {
                    return { fields: { reason: t("error.impersonation-reason-missing") }, form: undefined };
                }
                const response = await Api.admin.accounts.impersonate(account.uuid, reason);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        admin_account: (errors) => {
                            errors.form = t("error.impersonate-admin");
                        },
                        own_account: (errors) => {
                            errors.form = t("error.own-impersonation");
                        },
                        reason_missing: (errors) => {
                            errors.fields.reason = t("error.impersonation-reason-missing");
                        },
                    });
                }
                onDone();
            },
        },
    });

    useEffect(() => {
        form.reset({ reason: "" });
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.impersonate")}</DialogTitle>
            <DialogDescription>{t("description.impersonate", { username: account.username })}</DialogDescription>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"reason"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.impersonation-reason")}</RequiredLabel>
                                    <Description>{t("description.reason")}</Description>
                                    <Textarea
                                        autoFocus={true}
                                        rows={3}
                                        required={true}
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
                            {(error) => (typeof error === "string" ? <ErrorMessage>{error}</ErrorMessage> : null)}
                        </form.Subscribe>
                    </FieldGroup>
                </DialogBody>
                <DialogActions>
                    <Button plain onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                        {(submitting) => (
                            <Button type={"submit"} color={"amber"} disabled={submitting}>
                                {t("button.impersonate")}
                            </Button>
                        )}
                    </form.Subscribe>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
