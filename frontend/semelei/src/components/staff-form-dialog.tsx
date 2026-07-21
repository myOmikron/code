import { useForm } from "@tanstack/react-form";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogTitle,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Input,
    Label,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
    RequiredLabel,
} from "components";
import { Api } from "src/api/api";
import { AccountSchema, Role } from "src/api/generated";

/**
 * The properties for {@link StaffFormDialog}
 */
export type StaffFormDialogProps = {
    /** Whether the dialog is shown */
    open: boolean;
    /** The account to edit; create mode when unset */
    editing?: AccountSchema;
    /** Close without saving */
    onClose: () => void;
    /** Called after saving; carries the invite link on create */
    onSaved: (inviteLink?: string) => void;
};

/**
 * Create/edit dialog for a staff account
 *
 * @param props {@link StaffFormDialogProps}
 *
 * @returns the dialog
 */
export function StaffFormDialog(props: StaffFormDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: {
            username: props.editing?.username ?? "",
            role: (props.editing?.role ?? "Verkauf") as Role,
        },
        validators: {
            onSubmit: ({ value }) =>
                value.username.trim() ? undefined : { fields: { username: t("error.username-required") } },
        },
        onSubmit: async ({ value }) => {
            if (props.editing) {
                await Api.admin.accounts.update(props.editing.uuid, {
                    username: value.username.trim(),
                    role: value.role,
                });
                form.reset();
                props.onSaved();
            } else {
                const response = await Api.admin.accounts.create({
                    username: value.username.trim(),
                    role: value.role,
                });
                form.reset();
                props.onSaved(response.registration_link);
            }
        },
    });

    React.useEffect(() => {
        form.reset({
            username: props.editing?.username ?? "",
            role: (props.editing?.role ?? "Verkauf") as Role,
        });
    }, [props.editing, props.open]);

    return (
        <Dialog open={props.open} onClose={props.onClose} size={"md"}>
            <DialogTitle>{props.editing ? t("heading.edit-account") : t("heading.create-account")}</DialogTitle>
            <DialogBody>
                <Form onSubmit={form.handleSubmit}>
                    <Fieldset>
                        <FieldGroup>
                            <form.Field name={"username"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.username")}</RequiredLabel>
                                        <Input
                                            autoFocus
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name={"role"}>
                                {(fieldApi) => (
                                    <Field>
                                        <Label>{t("label.role")}</Label>
                                        <Listbox<Role>
                                            value={fieldApi.state.value}
                                            onChange={(value) => fieldApi.handleChange(value)}
                                        >
                                            <ListboxOption value={"Verkauf"}>
                                                <ListboxLabel>{t("label.role-verkauf")}</ListboxLabel>
                                            </ListboxOption>
                                            <ListboxOption value={"Admin"}>
                                                <ListboxLabel>{t("label.role-admin")}</ListboxLabel>
                                            </ListboxOption>
                                        </Listbox>
                                    </Field>
                                )}
                            </form.Field>
                            <DialogActions>
                                <Button plain onClick={props.onClose}>
                                    {tg("button.cancel")}
                                </Button>
                                <PrimaryButton type={"submit"}>{tg("button.save")}</PrimaryButton>
                            </DialogActions>
                        </FieldGroup>
                    </Fieldset>
                </Form>
            </DialogBody>
        </Dialog>
    );
}
