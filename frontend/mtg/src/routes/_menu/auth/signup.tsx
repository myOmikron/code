import { createFileRoute } from "@tanstack/react-router";
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
    PrimaryButton,
    RequiredLabel,
    Text,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Api } from "src/api/api.tsx";
import { handleFormError, isFormError } from "src/utils/error";

export const Route = createFileRoute("/_menu/auth/signup")({
    component: RouteComponent,
});

function RouteComponent() {
    const [t] = useTranslation("signup");
    const [sentFor, setSentFor] = useState<string | null>(null);

    const form = useForm({
        defaultValues: {
            email: "",
            username: "",
        },
        validators: {
            onSubmitAsync: async ({ value: { email, username } }) => {
                const response = await Api.signup.begin({ email, username });
                if (isFormError(response)) {
                    return handleFormError(response.error, {
                        username_taken: (errors) => {
                            errors.fields.username = t("error.username-taken");
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
            <div className={"flex h-full w-full items-center justify-center"}>
                <div className={"flex max-w-2xl flex-col gap-6"}>
                    <div className={"flex flex-col gap-3"}>
                        <Heading>{t("heading.check-mail")}</Heading>
                        <Text>{t("description.check-mail", { username: sentFor })}</Text>
                        <Text>{t("description.check-spam")}</Text>
                    </div>
                    <div className={"flex w-full justify-end gap-3"}>
                        <Button
                            outline={true}
                            onClick={() => {
                                setSentFor(null);
                                form.reset();
                            }}
                        >
                            {t("button.change-details")}
                        </Button>
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
                    <Legend>{t("heading.signup")}</Legend>

                    <FieldGroup>
                        <form.Field name={"username"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.username")}</RequiredLabel>
                                    <Description>{t("description.username")}</Description>
                                    <Input
                                        autoFocus={true}
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
                            <Button outline={true} href={"/auth/login"}>
                                {t("button.login-instead")}
                            </Button>
                            <PrimaryButton type={"submit"}>{t("button.signup")}</PrimaryButton>
                        </div>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </div>
    );
}
