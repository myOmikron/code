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
    Input,
    RequiredLabel,
    Textarea,
} from "components";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import type { AdminAccount } from "src/api/generated";
import { handleFormError, isFormError, type ValidationErrors } from "src/utils/error";
import { USERNAME_MAX_LEN, usernameErrorMessage, validateUsername } from "src/utils/username-rules";

/** The longest reason the backend accepts */
const REASON_MAX_LENGTH = 1024;

/**
 * The properties for {@link AdminRenameDialog}
 */
export type AdminRenameDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The Account to Rename */
    account: AdminAccount;
    /** Called when the dialog should close without having changed anything */
    onClose: () => void;
    /** Called after the Account was renamed */
    onDone: () => void;
};

/**
 * Dialog for an Admin renaming another Account.
 *
 * Takes a Rename reason, which only Admins ever read; the Account is mailed its new
 * username in the language the dialog is showing.
 *
 * @returns the dialog
 */
export function AdminRenameDialog({ open, account, onClose, onDone }: AdminRenameDialogProps) {
    const [t, i18n] = useTranslation("admin");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: { username: account.username, reason: "" },
        validators: {
            onSubmitAsync: async ({ value }): Promise<ValidationErrors | undefined> => {
                const username = value.username.trim();
                const reason = value.reason.trim();
                const ruleBroken = validateUsername(username);
                const fields: Record<string, string> = {};
                if (ruleBroken !== null) fields.username = usernameErrorMessage(tg, ruleBroken);
                if (reason === "") fields.reason = t("error.rename-reason-missing");
                if (Object.keys(fields).length > 0) return { fields, form: undefined };

                const language = i18n.resolvedLanguage?.startsWith("de") === true ? "De" : "En";
                const response = await Api.admin.accounts.rename(account.uuid, username, reason, language);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        own_account: (errors) => {
                            errors.form = t("error.own-rename");
                        },
                        reason_missing: (errors) => {
                            errors.fields.reason = t("error.rename-reason-missing");
                        },
                        username_taken: (errors) => {
                            errors.fields.username = tg("error.username-taken");
                        },
                    });
                }
                onDone();
            },
        },
    });

    useEffect(() => {
        form.reset({ username: account.username, reason: "" });
    }, [open, account.username]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.rename")}</DialogTitle>
            <DialogDescription>{t("description.rename", { username: account.username })}</DialogDescription>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <FieldGroup>
                        <form.Field name={"username"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.new-username")}</RequiredLabel>
                                    <Description>{tg("description.username")}</Description>
                                    <Input
                                        autoFocus={true}
                                        required={true}
                                        maxLength={USERNAME_MAX_LEN}
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
                        <form.Field name={"reason"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.rename-reason")}</RequiredLabel>
                                    <Description>{t("description.reason")}</Description>
                                    <Textarea
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
                            <Button type={"submit"} color={"blue"} disabled={submitting}>
                                {t("button.rename")}
                            </Button>
                        )}
                    </form.Subscribe>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
