import { createFileRoute, useRouter } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { toast } from "react-toastify";
import { Api } from "src/api/api";
import { AuthLayout } from "src/components/base/auth-layout";
import Form from "src/components/base/form";
import { Field, FieldGroup, Fieldset, Label, Legend } from "src/components/base/fieldset";
import { Text } from "src/components/base/text";
import { Input } from "src/components/base/input";
import { PrimaryButton } from "src/components/base/button";
import React from "react";
import Logo from "src/assets/bnv.svg?react";

/**
 * Props for {@link OidcAuthentication}
 */
export type OidcAuthenticationProps = {};

/**
 * Authentication for oidc
 */
export default function OidcAuthentication(props: OidcAuthenticationProps) {
    const [t] = useTranslation("oidc-auth");

    const search = Route.useSearch();
    const router = useRouter();

    const form = useForm({
        defaultValues: {
            username: "",
            password: "",
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const id = toast.loading(t("toast.signing-in"));
                try {
                    await Api.auth.login(value.username, value.password);
                } catch {
                    toast.update(id, {
                        isLoading: false,
                        render: t("toast.sign-in-failed"),
                        type: "error",
                        autoClose: 3500,
                        closeOnClick: true,
                    });
                    return {
                        form: t("error.invalid-username-or-password"),
                    };
                }

                toast.update(id, {
                    isLoading: false,
                    render: t("toast.signed-in"),
                    type: "success",
                    autoClose: 3500,
                    closeOnClick: true,
                });

                if (search.external) {
                    window.location.href = search.redirect_url;
                } else {
                    router.history.push(search.redirect_url);
                }
            },
        },
    });

    return (
        <AuthLayout>
            <Form onSubmit={form.handleSubmit} className={"grid w-full max-w-sm grid-cols-1 gap-8"}>
                <Fieldset className={"w-full"}>
                    <FieldGroup>
                        <Logo className={"h-8 w-fit dark:text-white"} />

                        <Legend>{t("heading.authentication")}</Legend>

                        <form.Subscribe selector={(state) => [state.errorMap]}>
                            {([errorMap]) =>
                                errorMap.onSubmit ? (
                                    <Text
                                        className={
                                            "!data-disabled:opacity-50 !dark:text-red-500 !text-base/6 !text-red-600 sm:!text-sm/6"
                                        }
                                    >
                                        {errorMap.onSubmit.form}
                                    </Text>
                                ) : null
                            }
                        </form.Subscribe>

                        <form.Field name={"username"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.username")}</Label>
                                    <Input
                                        autoFocus={true}
                                        autoComplete={"username"}
                                        required={true}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        invalid={fieldApi.form.state.errors.length > 0}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field name={"password"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.password")}</Label>
                                    <Input
                                        required={true}
                                        type={"password"}
                                        autoComplete={"current-password"}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        invalid={fieldApi.form.state.errors.length > 0}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <PrimaryButton type={"submit"} className={"w-full"}>
                            {t("button.sign-in")}
                        </PrimaryButton>

                        <Text className={"text-center"}>
                            <a href={"/links/reset"} className={"text-sm underline"}>
                                {t("link.forgot-password")}
                            </a>
                        </Text>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </AuthLayout>
    );
}

/**
 * Search parameters for the oidc authentication route
 */
type SearchParams = {
    /** Uri to redirect to after successful authentication */
    redirect_url: string;
    /** Whether to stay in this SPA */
    external: boolean;
};

export const Route = createFileRoute("/oidc/auth")({
    component: OidcAuthentication,
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
        redirect_url: (search?.redirect_url as string) || "/",
        external: (search?.external as boolean) || false,
    }),
    loaderDeps: ({ search: { redirect_url, external } }) => ({ redirect_url, external }),
});
