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
    PrimaryButton,
    RequiredLabel,
} from "components";
import { Api } from "src/api/api";
import { PublicCategory } from "src/api/generated";

/**
 * The properties for {@link CategoryFormDialog}
 */
export type CategoryFormDialogProps = {
    /** Whether the dialog is shown */
    open: boolean;
    /** The category to edit; create mode when unset */
    editing?: PublicCategory;
    /** Close without saving */
    onClose: () => void;
    /** Called after the category was saved */
    onSaved: () => void;
};

/**
 * Create/edit dialog for a category
 *
 * @param props {@link CategoryFormDialogProps}
 *
 * @returns the dialog
 */
export function CategoryFormDialog(props: CategoryFormDialogProps) {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: { name: props.editing?.name ?? "" },
        onSubmit: async ({ value }) => {
            if (!value.name.trim()) return;
            if (props.editing) {
                await Api.admin.categories.update(props.editing.uuid, { name: value.name.trim() });
            } else {
                await Api.admin.categories.create({ name: value.name.trim() });
            }
            form.reset();
            props.onSaved();
        },
    });

    // Reload default values when the target changes
    React.useEffect(() => {
        form.reset({ name: props.editing?.name ?? "" });
    }, [props.editing, props.open]);

    return (
        <Dialog open={props.open} onClose={props.onClose} size={"md"}>
            <DialogTitle>{props.editing ? t("heading.edit-category") : t("heading.create-category")}</DialogTitle>
            <DialogBody>
                <Form onSubmit={form.handleSubmit}>
                    <Fieldset>
                        <FieldGroup>
                            <form.Field name={"name"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.name")}</RequiredLabel>
                                        <Input
                                            autoFocus
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        />
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
