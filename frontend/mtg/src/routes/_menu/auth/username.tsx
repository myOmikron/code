import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Button,
    Description,
    ErrorMessage,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Heading,
    Input,
    Legend,
    RequiredLabel,
    Text,
    notify,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { PendingOidcLogin } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { useAccount } from "src/context/account";
import { handleFormError, isFormError } from "src/utils/error";
import { saveLastUsername } from "src/utils/username-storage";
import { validateUsername } from "src/utils/username-rules";

export const Route = createFileRoute("/_menu/auth/username")({
    component: RouteComponent,
});

/**
 * The username step of a first OIDC login.
 *
 * The provider vouched for the person and stated their email; the Account is only created
 * once a username is picked here. Leaving the page creates nothing.
 *
 * @returns the username step
 */
function RouteComponent() {
    const [t] = useTranslation("signup");
    const navigate = useNavigate();
    const { refresh } = useAccount();
    const [pending, setPending] = useState<PendingOidcLogin | null | undefined>(undefined);

    useEffect(() => {
        Api.auth.oidc
            .pending()
            .then((response) => setPending(response.pending ?? null))
            .catch(() => setPending(null));
    }, []);

    const form = useForm({
        defaultValues: { username: "" },
        validators: {
            onSubmitAsync: async ({ value: { username } }) => {
                const usernameError = validateUsername(username);
                if (usernameError !== null) {
                    return {
                        fields: {
                            username: {
                                length: t("error.username-length"),
                                charset: t("error.username-charset"),
                                start: t("error.username-start"),
                            }[usernameError],
                        },
                        form: undefined,
                    };
                }
                const response = await Api.auth.oidc.chooseUsername(username);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        username_taken: (errors) => {
                            errors.fields.username = t("error.username-taken");
                        },
                        nothing_pending: (errors) => {
                            errors.fields.username = t("error.nothing-pending");
                        },
                        // An Account took the email since the callback; the login page explains it.
                        email_in_use: () => {
                            void navigate({ to: "/auth/login", search: { oidc_error: "email_in_use" } });
                        },
                    });
                }

                const me = await refresh();
                if (me === null) {
                    return { fields: { username: t("error.nothing-pending") }, form: undefined };
                }
                saveLastUsername(me.username);
                notify.success(t("toast.signed-up", { username: me.username }));
                await navigate({ to: "/home" });
            },
        },
    });

    if (pending === undefined) return null;

    if (pending === null) {
        return (
            <div className={"flex h-full w-full items-center justify-center"}>
                <div className={"flex max-w-2xl flex-col gap-6"}>
                    <div className={"flex flex-col gap-3"}>
                        <Heading>{t("heading.choose-username")}</Heading>
                        <Text>{t("description.nothing-pending")}</Text>
                    </div>
                    <div className={"flex w-full justify-end"}>
                        <Button href={"/auth/login"}>{t("button.login-instead")}</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={"flex h-full w-full items-center justify-center"}>
            <Form onSubmit={form.handleSubmit} className={"max-w-2xl"}>
                <Fieldset>
                    <Legend>{t("heading.choose-username")}</Legend>
                    <Text>
                        {t("description.choose-username", { provider: pending.provider, email: pending.email })}
                    </Text>

                    <FieldGroup>
                        <form.Field name={"username"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.username")}</RequiredLabel>
                                    <Description>{t("description.username")}</Description>
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

                        <div className={"flex w-full justify-end gap-3"}>
                            <PrimaryButton type={"submit"} loading={form.state.isSubmitting}>
                                {t("button.choose-username")}
                            </PrimaryButton>
                        </div>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </div>
    );
}
