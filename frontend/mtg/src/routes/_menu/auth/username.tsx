import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
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
    TextLink,
    notify,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { OidcLoginFailure, PendingOidcLogin } from "src/api/generated";
import { PrimaryButton } from "src/components/primary-button";
import { useAccount } from "src/context/account";
import { handleFormError, isFormError } from "src/utils/error";
import { saveLastUsername } from "src/utils/username-storage";
import { usernameErrorMessage, validateUsername } from "src/utils/username-rules";

export const Route = createFileRoute("/_menu/auth/username")({
    component: RouteComponent,
});

/**
 * The username step of a first OIDC login.
 *
 * The provider vouched for the person and stated their email; the Account is only created
 * once a username is picked here. Leaving the page creates nothing. An email an Account took
 * since the callback ends the login on the login page, which explains it.
 *
 * @returns the username step
 */
function RouteComponent() {
    const [t] = useTranslation("signup");
    const [tg] = useTranslation();
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
                    return { fields: { username: usernameErrorMessage(tg, usernameError) }, form: undefined };
                }
                const response = await Api.auth.oidc.chooseUsername(username);
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        username_taken: (errors) => {
                            errors.fields.username = tg("error.username-taken");
                        },
                        nothing_pending: (errors) => {
                            errors.fields.username = t("error.nothing-pending");
                        },
                        email_in_use: () => {
                            void navigate({
                                to: "/auth/login",
                                search: { oidc_error: OidcLoginFailure.email_in_use },
                            });
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
                    <Text>
                        {t("label.have-account")} <TextLink href={"/auth/login"}>{t("button.login")}</TextLink>
                    </Text>
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
