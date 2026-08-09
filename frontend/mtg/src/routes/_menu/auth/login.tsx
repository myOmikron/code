import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
    Button,
    Description,
    ErrorMessage,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    Input,
    Label,
    Legend,
    PrimaryButton,
    RequiredLabel,
    Switch,
    SwitchField,
    notify,
} from "components";
import { useForm } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { useAccount } from "src/context/account";
import { loadLastUsername, saveLastUsername } from "src/utils/username-storage";
import { handleFormError, isFormError } from "src/utils/error";
import { authenticatePasskey, classifyPasskeyError } from "src/utils/webauthn";

/**
 * Search params of the login route
 */
export type LoginSearch = {
    /** Where to go once the login went through; set by {@link RequireAccount} */
    redirect?: string;
};

export const Route = createFileRoute("/_menu/auth/login")({
    component: RouteComponent,

    validateSearch: (search: Record<string, unknown>): LoginSearch => ({
        // Only same-site paths — an absolute url here would make this an open redirect.
        redirect:
            typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
                ? search.redirect
                : undefined,
    }),
});

function RouteComponent() {
    const [t] = useTranslation("login");
    const navigate = useNavigate();
    const { redirect } = Route.useSearch();
    const { refresh } = useAccount();

    const form = useForm({
        defaultValues: {
            username: loadLastUsername(),
            rememberMe: true,
        },
        validators: {
            onSubmitAsync: async ({ value: { username, rememberMe } }) => {
                const started = await Api.auth.startLogin(username);
                if (isFormError(started)) {
                    return handleFormError(started.error, {
                        unknown_username: (errors) => {
                            errors.fields.username = t("error.unknown-username");
                        },
                    });
                }

                let credential: unknown;
                try {
                    credential = await authenticatePasskey(started.options);
                } catch (error) {
                    console.error(error);
                    return handleFormError(classifyPasskeyError(error), {
                        unsupported: (errors) => {
                            errors.form = t("error.unsupported");
                        },
                        insecure_context: (errors) => {
                            errors.form = t("error.insecure-context");
                        },
                        wrong_domain: (errors) => {
                            errors.form = t("error.wrong-domain");
                        },
                        no_passkey_or_aborted: (errors) => {
                            errors.form = t("error.no-passkey-or-aborted");
                        },
                        // Registration-only, so it cannot happen here.
                        already_registered: (errors) => {
                            errors.form = t("error.unknown");
                        },
                        authenticator_error: (errors) => {
                            errors.form = t("error.authenticator-error");
                        },
                        unknown: (errors) => {
                            errors.form = t("error.unknown");
                        },
                    });
                }

                const finished = await Api.auth.finishLogin(credential, rememberMe);
                if (isFormError(finished)) {
                    return handleFormError(finished.error, {
                        no_ceremony: (errors) => {
                            errors.form = t("error.no-ceremony");
                        },
                        malformed_credential: (errors) => {
                            errors.form = t("error.rejected");
                        },
                        authentication_failed: (errors) => {
                            errors.form = t("error.rejected");
                        },
                    });
                }

                // `login/finish` answers with no payload; the session read is the only source.
                const me = await refresh();
                if (me === null) {
                    return { form: t("error.rejected") };
                }
                saveLastUsername(me.username);
                notify.success(t("toast.logged-in", { username: me.username }));
                // Straight to `/home`, not to `/` — the index only exists to
                // redirect there, and going through it costs an extra navigation.
                await navigate({ to: redirect ?? "/home" });
            },
        },
    });

    const submitError = form.state.errorMap.onSubmit;
    const formError =
        typeof submitError === "object" && submitError !== null && "form" in submitError
            ? (submitError.form as string | undefined)
            : undefined;

    return (
        <div className={"flex h-full w-full items-center justify-center"}>
            <div className={"flex max-w-2xl flex-col gap-6"}>
                <Form onSubmit={form.handleSubmit}>
                    <Fieldset>
                        <Legend>{t("heading.login")}</Legend>

                        <FieldGroup>
                            <form.Field name={"username"}>
                                {(fieldApi) => (
                                    <Field>
                                        <RequiredLabel>{t("label.username")}</RequiredLabel>
                                        <Description>{t("description.login")}</Description>
                                        <Input
                                            autoFocus={true}
                                            autoComplete={"username webauthn"}
                                            invalid={fieldApi.state.meta.errors.length > 0}
                                            value={fieldApi.state.value}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        />
                                        {fieldApi.state.meta.errors.map((error) => (
                                            <ErrorMessage key={String(error)}>{String(error)}</ErrorMessage>
                                        ))}
                                        {formError !== undefined && <ErrorMessage>{formError}</ErrorMessage>}
                                    </Field>
                                )}
                            </form.Field>

                            <form.Field name={"rememberMe"}>
                                {(fieldApi) => (
                                    <SwitchField>
                                        <Label>{t("label.remember-me")}</Label>
                                        <Switch
                                            color={"blue"}
                                            checked={fieldApi.state.value}
                                            onChange={(checked) => fieldApi.handleChange(checked)}
                                        />
                                    </SwitchField>
                                )}
                            </form.Field>

                            <div className={"flex w-full justify-end gap-3"}>
                                <Button outline={true} href={"/auth/signup"}>
                                    {t("button.signup-instead")}
                                </Button>
                                <PrimaryButton type={"submit"} loading={form.state.isSubmitting}>
                                    {t("button.login")}
                                </PrimaryButton>
                            </div>
                        </FieldGroup>
                    </Fieldset>
                </Form>
            </div>
        </div>
    );
}
