import { createFileRoute } from "@tanstack/react-router";
import { EnvelopeIcon, FingerPrintIcon } from "@heroicons/react/24/outline";
import {
    Button,
    Description,
    Divider,
    ErrorMessage,
    Field,
    FieldGroup,
    Form,
    Heading,
    Input,
    RequiredLabel,
    Text,
    TextLink,
} from "components";
import { PrimaryButton } from "src/components/primary-button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Api } from "src/api/api.tsx";
import { AuthLayout } from "src/components/auth-layout";
import { OpenIdLoginButtons } from "src/components/openid-login-buttons";
import { handleFormError, isFormError } from "src/utils/error";
import { usernameErrorMessage, validateUsername } from "src/utils/username-rules";

export const Route = createFileRoute("/_menu/auth/signup")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t, i18n] = useTranslation("signup");
    const [tg] = useTranslation();
    const [sentFor, setSentFor] = useState<string | null>(null);

    const form = useForm({
        defaultValues: {
            email: "",
            username: "",
        },
        validators: {
            onSubmitAsync: async ({ value: { email, username } }) => {
                // A username the backend would reject never leaves the browser: the server
                // refuses it while parsing the request body, which answers with a plain 400
                // instead of a form error and would end up on the error screen.
                const usernameError = validateUsername(username);
                if (usernameError !== null) {
                    return { fields: { username: usernameErrorMessage(tg, usernameError) }, form: undefined };
                }
                // The registration mail should read like the page that caused
                // it, so the UI's language travels with the request. Anything
                // that is not German falls back to English.
                const language = i18n.resolvedLanguage?.startsWith("de") === true ? "De" : "En";
                const response = await Api.signup.begin({ email, username, language });
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        username_taken: (errors) => {
                            errors.fields.username = tg("error.username-taken");
                        },
                        email_malformed: (errors) => {
                            errors.fields.email = t("error.email-malformed");
                        },
                    });
                }
                setSentFor(response.username);
            },
        },
    });

    // Names the username, not the address just typed: for a re-issued invite the mail goes to
    // the address already on the account.
    if (sentFor !== null) {
        return (
            <AuthLayout>
                <div className={"flex flex-col items-center gap-4 text-center"}>
                    <span
                        className={
                            "flex size-12 items-center justify-center rounded-full bg-lime-500/15 text-lime-700 dark:bg-lime-400/10 dark:text-lime-400"
                        }
                    >
                        <EnvelopeIcon className={"size-6"} aria-hidden={"true"} />
                    </span>
                    <Heading>{t("heading.check-mail")}</Heading>
                    <Text>{t("description.check-mail", { username: sentFor })}</Text>
                    <Text>{t("description.check-spam")}</Text>
                </div>
                <div className={"flex flex-col gap-3"}>
                    <Button className={"w-full"} href={"/auth/login"}>
                        {t("button.login-instead")}
                    </Button>
                    <Button
                        plain={true}
                        className={"w-full"}
                        onClick={() => {
                            setSentFor(null);
                            form.reset();
                        }}
                    >
                        {t("button.change-details")}
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className={"flex flex-col gap-2 text-center"}>
                <Heading>{t("heading.signup")}</Heading>
                <Text>{t("description.signup")}</Text>
            </div>

            <Form onSubmit={form.handleSubmit}>
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
                                    autoComplete={"username"}
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
                    <form.Field name={"email"}>
                        {(fieldApi) => (
                            <Field>
                                <RequiredLabel>{t("label.email")}</RequiredLabel>
                                <Input
                                    type={"email"}
                                    required={true}
                                    maxLength={255}
                                    autoComplete={"email"}
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

                    <div className={"flex flex-col gap-3"}>
                        <PrimaryButton type={"submit"} className={"w-full"} loading={form.state.isSubmitting}>
                            {t("button.signup")}
                        </PrimaryButton>
                        <Text className={"flex items-start gap-2"}>
                            <FingerPrintIcon className={"mt-1 size-4 shrink-0"} aria-hidden={"true"} />
                            {t("description.passkey")}
                        </Text>
                    </div>
                </FieldGroup>
            </Form>

            <OpenIdLoginButtons rememberMe={true} />

            <Divider soft={true} />

            <Text className={"text-center"}>
                {t("label.have-account")} <TextLink href={"/auth/login"}>{t("button.login")}</TextLink>
            </Text>
        </AuthLayout>
    );
}
