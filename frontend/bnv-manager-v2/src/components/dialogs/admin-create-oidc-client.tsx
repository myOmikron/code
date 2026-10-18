import React from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogActions,
    DialogBody,
    DialogDescription,
    DialogProps,
    DialogTitle,
} from "src/components/base/dialog";
import Form from "src/components/base/form";
import { useForm } from "@tanstack/react-form";
import { ErrorMessage, Field, FieldGroup, Fieldset, Label, RequiredLabel } from "src/components/base/fieldset";
import { Button, PrimaryButton } from "src/components/base/button";
import { Api } from "src/api/api";
import { Input } from "src/components/base/input";
import { CreatedOidcClient } from "src/api/generated/admin";
import { toast } from "react-toastify";
import { ClipboardIcon } from "@heroicons/react/16/solid";

/**
 * The properties for {@link AdminCreateOidcClientDialog}
 */
export type AdminCreateOidcClientDialogProps = DialogProps & {
    /** Callback once the new OIDC client was created and its credentials were shown */
    onCreate: () => void;
};

/**
 * A dialog to create a new OIDC client
 *
 * After the creation it shows the client's credentials, the only time its secret is visible.
 */
export default function AdminCreateOidcClientDialog(props: AdminCreateOidcClientDialogProps) {
    const [t] = useTranslation("dialog-create-oidc-client");
    const [tg] = useTranslation();

    const [created, setCreated] = React.useState<CreatedOidcClient>();

    const form = useForm({
        defaultValues: {
            name: "",
            redirectUrl: "",
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const res = await Api.admin.oidcClients.create({
                    name: value.name,
                    redirect_uri: value.redirectUrl,
                });
                if (res.result === "Err") {
                    return {
                        fields: {
                            redirectUrl: res.error.invalid_redirect_uri
                                ? t("error.redirect-url-not-allowed")
                                : undefined,
                        },
                    };
                }

                setCreated(res.value);
            },
        },
    });

    React.useEffect(() => {
        if (props.open) {
            form.reset();
            setCreated(undefined);
        }
    }, [props.open]);

    const copy = async (value: string) => {
        await navigator.clipboard.writeText(value);
        toast.success(tg("toast.copied-to-clipboard"));
    };

    return (
        <Dialog open={props.open} onClose={created ? props.onCreate : props.onClose}>
            {created ? (
                <>
                    <DialogTitle>{t("heading.client-created")}</DialogTitle>
                    <DialogDescription>{t("description.secret-shown-once")}</DialogDescription>
                    <DialogBody>
                        <Fieldset>
                            <FieldGroup>
                                <Field>
                                    <Label>{t("label.client-id")}</Label>
                                    <div className={"flex items-center gap-2"}>
                                        <Input readOnly={true} value={created.client_id} />
                                        <Button
                                            plain={true}
                                            aria-label={t("accessibility.copy-client-id")}
                                            onClick={() => copy(created.client_id)}
                                        >
                                            <ClipboardIcon />
                                        </Button>
                                    </div>
                                </Field>
                                <Field>
                                    <Label>{t("label.client-secret")}</Label>
                                    <div className={"flex items-center gap-2"}>
                                        <Input readOnly={true} value={created.client_secret} />
                                        <Button
                                            plain={true}
                                            aria-label={t("accessibility.copy-client-secret")}
                                            onClick={() => copy(created.client_secret)}
                                        >
                                            <ClipboardIcon />
                                        </Button>
                                    </div>
                                </Field>
                                <DialogActions>
                                    <PrimaryButton onClick={props.onCreate}>{tg("button.close")}</PrimaryButton>
                                </DialogActions>
                            </FieldGroup>
                        </Fieldset>
                    </DialogBody>
                </>
            ) : (
                <>
                    <DialogTitle>{t("heading.create-oidc-client")}</DialogTitle>
                    <DialogBody>
                        <Form onSubmit={form.handleSubmit}>
                            <Fieldset>
                                <FieldGroup>
                                    <form.Field name={"name"}>
                                        {(fieldApi) => (
                                            <Field>
                                                <RequiredLabel>{t("label.name")}</RequiredLabel>
                                                <Input
                                                    autoFocus={true}
                                                    required={true}
                                                    maxLength={255}
                                                    value={fieldApi.state.value}
                                                    onChange={(e) => fieldApi.handleChange(e.target.value)}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                />
                                                {fieldApi.state.meta.errors.map((err) => (
                                                    <ErrorMessage>{err}</ErrorMessage>
                                                ))}
                                            </Field>
                                        )}
                                    </form.Field>

                                    <form.Field
                                        name={"redirectUrl"}
                                        validators={{
                                            onSubmit: ({ value }) =>
                                                URL.canParse(value) ? undefined : t("error.redirect-url-invalid"),
                                        }}
                                    >
                                        {(fieldApi) => (
                                            <Field>
                                                <RequiredLabel>{t("label.redirect-url")}</RequiredLabel>
                                                <Input
                                                    type={"url"}
                                                    required={true}
                                                    value={fieldApi.state.value}
                                                    onChange={(e) => fieldApi.handleChange(e.target.value)}
                                                    invalid={fieldApi.state.meta.errors.length > 0}
                                                />
                                                {fieldApi.state.meta.errors.map((err) => (
                                                    <ErrorMessage>{err}</ErrorMessage>
                                                ))}
                                            </Field>
                                        )}
                                    </form.Field>

                                    <DialogActions>
                                        <Button onClick={props.onClose} plain={true}>
                                            {tg("button.cancel")}
                                        </Button>
                                        <PrimaryButton type={"submit"}>{t("button.create-oidc-client")}</PrimaryButton>
                                    </DialogActions>
                                </FieldGroup>
                            </Fieldset>
                        </Form>
                    </DialogBody>
                </>
            )}
        </Dialog>
    );
}
