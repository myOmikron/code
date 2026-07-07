import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import Form from "src/components/base/form";
import { ErrorMessage, Field, FieldGroup, Label, RequiredLabel } from "src/components/base/fieldset";
import { useForm } from "@tanstack/react-form";
import { Input } from "src/components/base/input";
import { Button, PrimaryButton } from "src/components/base/button";
import { Text } from "src/components/base/text";
import { Heading } from "src/components/base/heading";
import React, { lazy, Suspense } from "react";
import { zxcvbn } from "@zxcvbn-ts/core";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { AuthLayout } from "src/components/base/auth-layout";
import InviteError from "src/components/error/invite-error";

const PasswordStrength = lazy(() => import("src/components/base/pw-strength"));

/**
 * The properties for {@link Invite}
 */
export type InviteProps = {};

/**
 * Invite form to create an account
 */
export default function Invite(props: InviteProps) {
    const [t] = useTranslation("invite");

    const { inviteId } = Route.useParams();
    const navigate = useNavigate();

    const data = Route.useLoaderData();

    const [showPassword, setShowPassword] = React.useState(false);

    const form = useForm({
        defaultValues: {
            password: "",
            password2: "",
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const res = await Api.common.invites.accept(inviteId, { password: value.password });

                if (res.result === "Err") {
                    return { form: res.error.expired ? t("error.invite-expired") : undefined };
                }

                await navigate({ to: "/" });
            },
        },
    });

    return (
        <AuthLayout>
            <Form onSubmit={form.handleSubmit} className={"grid w-full max-w-sm grid-cols-1 gap-8"}>
                <Heading>{t("heading.invite", { name: data.display_name })}</Heading>
                <Text>{t("description.invite", { name: data.username })}</Text>
                <FieldGroup>
                    <Field className={"hidden"} key={"username"}>
                        <Label>{t("label.username")}</Label>
                        <Input defaultValue={data.username} autoComplete={"username"} />
                    </Field>
                    <form.Field
                        name={"password"}
                        validators={{
                            onChangeAsync: async ({ value }) => {
                                if (value !== "" && zxcvbn(value).score < 3) {
                                    return t("error.stronger-password");
                                }
                                return undefined;
                            },
                            onChangeAsyncDebounceMs: 300,
                        }}
                    >
                        {(fieldApi) => (
                            <>
                                <Field>
                                    <RequiredLabel>{t("label.password")}</RequiredLabel>
                                    <div className={"mt-2 flex gap-2"}>
                                        <Input
                                            autoComplete={"new-password"}
                                            autoFocus={true}
                                            required={true}
                                            type={showPassword ? "text" : "password"}
                                            invalid={fieldApi.state.meta.errors.length !== 0}
                                            value={fieldApi.state.value}
                                            onBlur={fieldApi.handleBlur}
                                            onChange={(e) => fieldApi.handleChange(e.target.value)}
                                        />
                                        <Button plain={true} onClick={() => setShowPassword((prev) => !prev)}>
                                            {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                        </Button>
                                    </div>
                                    {fieldApi.state.meta.errors.map((err) => (
                                        <ErrorMessage>{err}</ErrorMessage>
                                    ))}
                                </Field>
                                <Suspense fallback={<div></div>}>
                                    <PasswordStrength password={fieldApi.state.value} />
                                </Suspense>
                            </>
                        )}
                    </form.Field>

                    <form.Field
                        name={"password2"}
                        validators={{
                            onChangeListenTo: ["password"],
                            onChangeAsync: ({ value, fieldApi }) => {
                                if (fieldApi.getMeta().isDirty && value !== fieldApi.form.getFieldValue("password")) {
                                    return t("error.password-mismatch");
                                }
                                return undefined;
                            },
                            onChangeAsyncDebounceMs: 200,
                        }}
                    >
                        {(fieldApi) => (
                            <Field>
                                <RequiredLabel>{t("label.repeat-password")}</RequiredLabel>
                                <Input
                                    autoComplete={"new-password"}
                                    required={true}
                                    invalid={fieldApi.state.meta.errors.length > 0}
                                    type={"password"}
                                    value={fieldApi.state.value}
                                    onChange={(e) => fieldApi.handleChange(e.target.value)}
                                />
                                {fieldApi.state.meta.errors.map((err) => (
                                    <ErrorMessage>{err}</ErrorMessage>
                                ))}
                            </Field>
                        )}
                    </form.Field>

                    <PrimaryButton type={"submit"} className={"w-full"}>
                        {t("button.accept-invite")}
                    </PrimaryButton>
                </FieldGroup>
            </Form>
        </AuthLayout>
    );
}

export const Route = createFileRoute("/invites/$inviteId")({
    component: Invite,
    errorComponent: InviteError,
    loader: async ({ params: { inviteId } }) => Api.common.invites.get(inviteId),
});
