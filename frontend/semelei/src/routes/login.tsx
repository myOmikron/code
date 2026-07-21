import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    AuthLayout,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Heading,
    Input,
    PrimaryButton,
    RequiredLabel,
    Text,
} from "components";
import Logo from "src/assets/logo.svg?react";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import { authenticatePasskey } from "src/utils/webauthn";

/**
 * Search params of the login route
 */
export type LoginSearch = {
    /** Where to navigate after a successful login */
    redirect_url?: string;
};

/** localStorage key remembering the last successfully used username */
const LAST_USERNAME_KEY = "semelei:last-username";

/**
 * Staff login: username + passkey.
 *
 * A username is required because roaming authenticators (e.g. YubiKeys)
 * store non-discoverable credentials — the server needs the username to
 * offer the account's credentials as the allow-list.
 *
 * @returns the page
 */
function Login() {
    const [t] = useTranslation("login");
    const navigate = useNavigate();
    const search = Route.useSearch();

    const form = useForm({
        // Prefill the last-used username so staff don't retype it each shift
        defaultValues: { username: localStorage.getItem(LAST_USERNAME_KEY) ?? "" },
        validators: {
            onSubmit: ({ value }) =>
                value.username.trim() ? undefined : { fields: { username: t("error.username-required") } },
        },
        onSubmit: async ({ value }) => {
            const username = value.username.trim();
            try {
                const { options } = await Api.auth.startLogin(username);
                const credential = await authenticatePasskey(options);
                await Api.auth.finishLogin(credential);
                localStorage.setItem(LAST_USERNAME_KEY, username);
                await navigate({ to: search.redirect_url ?? "/verkauf" });
            } catch (e) {
                console.error(e);
                return { form: t("error.login-failed") };
            }
        },
    });

    return (
        <AuthLayout>
            <div className={"flex w-full max-w-sm flex-col gap-6"}>
                <div className={"flex flex-col items-center gap-3"}>
                    <Logo className={"size-14"} />
                    <Heading>{t("heading.login")}</Heading>
                    <Text>{t("description.login")}</Text>
                </div>
                <Form onSubmit={form.handleSubmit}>
                    <Fieldset>
                        <FieldGroup>
                            <form.Field name={"username"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.username")}</RequiredLabel>
                                        <Input
                                            autoFocus
                                            autoComplete={"username webauthn"}
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                        />
                                        {fieldApi.state.meta.errors.length > 0 && (
                                            <InlineError>{String(fieldApi.state.meta.errors[0])}</InlineError>
                                        )}
                                    </Field>
                                )}
                            </form.Field>
                            <form.Subscribe selector={(state) => [state.isSubmitting, state.errorMap]}>
                                {([isSubmitting, errorMap]) => (
                                    <>
                                        <PrimaryButton
                                            type={"submit"}
                                            loading={isSubmitting as boolean}
                                            className={"w-full"}
                                        >
                                            {t("button.sign-in")}
                                        </PrimaryButton>
                                        {(errorMap as { onSubmit?: { form?: string } })?.onSubmit?.form && (
                                            <InlineError>
                                                {(errorMap as { onSubmit: { form: string } }).onSubmit.form}
                                            </InlineError>
                                        )}
                                    </>
                                )}
                            </form.Subscribe>
                        </FieldGroup>
                    </Fieldset>
                </Form>
            </div>
        </AuthLayout>
    );
}

export const Route = createFileRoute("/login")({
    component: Login,
    validateSearch: (search: Record<string, unknown>): LoginSearch => ({
        redirect_url: typeof search.redirect_url === "string" ? search.redirect_url : undefined,
    }),
});
