import {
    Button,
    Description,
    Dialog,
    DialogActions,
    DialogBody,
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
import type { SimplePasskey } from "src/api/generated";
import { handleFormError, isFormError } from "src/utils/error";

/**
 * The properties for {@link RenamePasskeyDialog}
 */
export type RenamePasskeyDialogProps = {
    /** The passkey to rename, `null` while the dialog is closed */
    passkey: SimplePasskey | null;
    /** Closes the dialog */
    onClose: () => void;
    /** Called once the list on screen is out of date: after a rename, or when the passkey is gone */
    onChanged: () => Promise<void>;
};

/**
 * Giving one of the account's passkeys a label of the person's choosing.
 *
 * @returns the dialog
 */
export function RenamePasskeyDialog({ passkey, onClose, onChanged }: RenamePasskeyDialogProps) {
    const [t] = useTranslation("profile");

    const form = useForm({
        defaultValues: { label: passkey?.label ?? "" },
        validators: {
            onSubmitAsync: async ({ value }) => {
                if (passkey === null) return;
                const response = await Api.accounts.passkeys.rename(passkey.uuid, value.label.trim());
                if (isFormError(response)) {
                    if (response.error.unknown_passkey) {
                        onClose();
                        await onChanged();
                        return;
                    }
                    return handleFormError(response.error, {
                        empty_label: (errors) => {
                            errors.fields.label = t("error.empty-label");
                        },
                        unknown_passkey: () => {},
                    });
                }

                notify.success(t("toast.passkey-renamed"));
                onClose();
                await onChanged();
            },
        },
    });

    useEffect(() => {
        form.reset({ label: passkey?.label ?? "" });
    }, [passkey]);

    return (
        <Dialog open={passkey !== null} onClose={onClose}>
            <DialogTitle>{t("heading.rename-passkey")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <form.Field name={"label"}>
                        {(fieldApi) => (
                            <Field>
                                <RequiredLabel>{t("label.passkey-label")}</RequiredLabel>
                                <Description>{t("description.rename-passkey")}</Description>
                                <Input
                                    autoFocus={true}
                                    required={true}
                                    maxLength={255}
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
                        {t("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"} loading={form.state.isSubmitting}>
                        {t("button.rename-passkey")}
                    </PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
