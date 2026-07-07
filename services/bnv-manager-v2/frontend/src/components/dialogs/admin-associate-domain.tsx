import { useTranslation } from "react-i18next";
import { Dialog, DialogActions, DialogBody, DialogProps, DialogTitle } from "src/components/base/dialog";
import { DomainSchema } from "src/api/generated/admin";
import { useForm } from "@tanstack/react-form";
import Form from "src/components/base/form";
import { Button, PrimaryButton } from "src/components/base/button";
import { ErrorMessage, Field, FieldGroup, Fieldset, RequiredLabel } from "src/components/base/fieldset";
import { Combobox, ComboboxLabel, ComboboxOption } from "src/components/base/combobox";
import { Api, UUID } from "src/api/api";
import React from "react";

/**
 * Props for {@link AssociateDomainDialog}
 */
export type AssociateDomainDialogProps = DialogProps & {
    /** The uuid of the club */
    club_uuid: UUID;
    /** The domains that are not associated with a club */
    unassociatedDomains: Array<DomainSchema>;
    /** Callback when association was executed */
    onAssociate: () => void;
};

/**
 * Dialog to associate a domain
 */
export default function AssociateDomainDialog(props: AssociateDomainDialogProps) {
    const [t] = useTranslation("dialog-associate-domain");
    const [tg] = useTranslation();

    const form = useForm({
        defaultValues: {
            domain: null as DomainSchema | null | undefined,
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                if (!value.domain) return { fields: { domain: t("error.missing-value") } };

                await Api.admin.clubs.associateDomain(props.club_uuid, value.domain.uuid);

                props.onAssociate();
            },
        },
    });

    React.useEffect(() => {
        if (props.open) form.reset();
    }, [props.open]);

    return (
        <Dialog open={props.open} onClose={props.onClose}>
            <DialogTitle>{t("heading.associate-domain")}</DialogTitle>
            <Form onSubmit={form.handleSubmit}>
                <DialogBody>
                    <Fieldset>
                        <FieldGroup>
                            <form.Field name={"domain"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.domain")}</RequiredLabel>
                                        <Combobox
                                            options={props.unassociatedDomains}
                                            displayValue={(d) => (d ? d.domain : "")}
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e)}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                        >
                                            {(v) => (
                                                <ComboboxOption value={v}>
                                                    <ComboboxLabel>{v.domain}</ComboboxLabel>
                                                </ComboboxOption>
                                            )}
                                        </Combobox>
                                        {fieldApi.state.meta.errors.map((err) => (
                                            <ErrorMessage>{err}</ErrorMessage>
                                        ))}
                                    </Field>
                                )}
                            </form.Field>
                        </FieldGroup>
                    </Fieldset>
                </DialogBody>
                <DialogActions>
                    <Button plain={true} onClick={props.onClose}>
                        {tg("button.cancel")}
                    </Button>
                    <PrimaryButton type={"submit"}>{t("button.associate-domain")}</PrimaryButton>
                </DialogActions>
            </Form>
        </Dialog>
    );
}
