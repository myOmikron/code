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
    Form,
    Input,
    RequiredLabel,
    notify,
} from "components";
import { PrimaryButton } from "src/components/primary-button";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { handleFormError, isFormError } from "src/utils/error";
import { validateUsername } from "src/utils/username-rules";
import { signalUsername } from "src/utils/webauthn";

/**
 * The properties for {@link RenameAccountDialog}
 */
export type RenameAccountDialogProps = {
    /** Whether the dialog is on screen */
    open: boolean;
    /** The account's current username */
    username: string;
    /** Closes the dialog */
    onClose: () => void;
    /** Called once the account goes by its new username */
    onRenamed: () => Promise<void>;
};

/**
 * Giving the logged-in account a new username.
 *
 * @returns the dialog
 */
export function RenameAccountDialog({ open, username, onClose, onRenamed }: RenameAccountDialogProps) {
    const [t] = useTranslation("profile");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: { username },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const wanted = value.username.trim();
                const ruleBroken = validateUsername(wanted);
                if (ruleBroken !== null) {
                    return {
                        fields: {
                            username: {
                                length: tg("error.username-length"),
                                charset: tg("error.username-charset"),
                                start: tg("error.username-start"),
                            }[ruleBroken],
                        },
                        form: undefined,
                    };
                }

                const response = await Api.accounts.rename(wanted);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        username_taken: (errors) => {
                            errors.fields.username = tg("error.username-taken");
                        },
                    });
                }

                await signalUsername(response.rp_id, response.user_id, response.username);
                notify.success(t("toast.account-renamed", { username: response.username }));
                onClose();
                await onRenamed();
            },
        },
    });

    useEffect(() => {
        form.reset({ username });
    }, [open, username]);

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>{t("heading.rename-account")}</DialogTitle>
            <DialogDescription>{t("description.rename-account")}</DialogDescription>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <form.Field name={"username"}>
                        {(fieldApi) => (
                            <Field>
                                <RequiredLabel>{tg("label.username")}</RequiredLabel>
                                <Description>{tg("description.username")}</Description>
                                <Input
                                    autoFocus={true}
                                    required={true}
                                    maxLength={32}
                                    invalid={fieldApi.state.meta.errors.length > 0}
                                    value={fieldApi.state.value}
                                    onChange={(e) => fieldApi.handleChange(e.target.value)}
                                />
                                {fieldApi.state.meta.errors.map((error) => (
                                    <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                ))}
                            </Field>
                        )}
                    </form.Field>
                </DialogBody>
                <DialogActions>
                    <Button plain type={"button"} onClick={onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"} loading={form.state.isSubmitting}>
                        {t("button.rename-account")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
