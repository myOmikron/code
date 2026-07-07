import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import Form from "src/components/base/form";
import { ErrorMessage, Field, FieldGroup, RequiredLabel } from "src/components/base/fieldset";
import { useForm } from "@tanstack/react-form";
import { Input } from "src/components/base/input";
import { Button, PrimaryButton } from "src/components/base/button";
import { Text, TextLink } from "src/components/base/text";
import { Heading } from "src/components/base/heading";
import React, { lazy, Suspense } from "react";
import { zxcvbn } from "@zxcvbn-ts/core";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { AuthLayout } from "src/components/base/auth-layout";

const PasswordStrength = lazy(() => import("src/components/base/pw-strength"));

/**
 * Props for {@link ResetPassword}
 */
export type ResetPasswordProps = {};

/**
 * Password reset page using 6-digit code
 */
export default function ResetPassword(props: ResetPasswordProps) {
    const [t] = useTranslation("reset");
    const navigate = useNavigate();

    const [step, setStep] = React.useState<"code" | "password">("code");
    const [code, setCode] = React.useState("");
    const [displayName, setDisplayName] = React.useState("");
    const [codeError, setCodeError] = React.useState<string>();
    const [showPassword, setShowPassword] = React.useState(false);

    const codeForm = useForm({
        defaultValues: { code: "" },
        validators: {
            onSubmitAsync: async ({ value }) => {
                setCodeError(undefined);
                try {
                    const res = await Api.common.credentialReset.verify(value.code);
                    setCode(value.code);
                    setDisplayName(res.display_name);
                    setStep("password");
                } catch {
                    setCodeError(t("error.invalid-code"));
                    return { form: t("error.invalid-code") };
                }
            },
        },
    });

    const passwordForm = useForm({
        defaultValues: {
            password: "",
            password2: "",
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const res = await Api.common.credentialReset.reset(code, { password: value.password });

                if (res.result === "Err" && "error" in res) {
                    if (res.error.invalid_code || res.error.expired) {
                        return { form: t("error.invalid-code") };
                    }
                    if (res.error.low_entropy) {
                        return { form: t("error.low-entropy") };
                    }
                }

                await navigate({ to: "/" });
            },
        },
    });

    if (step === "code") {
        return (
            <AuthLayout>
                <Form onSubmit={codeForm.handleSubmit} className={"grid w-full max-w-sm grid-cols-1 gap-8"}>
                    <Heading>{t("heading.enter-code")}</Heading>
                    <Text>{t("description.enter-code")}</Text>
                    <FieldGroup>
                        <codeForm.Field name={"code"}>
                            {(fieldApi) => (
                                <Field>
                                    <RequiredLabel>{t("label.code")}</RequiredLabel>
                                    <Input
                                        autoFocus={true}
                                        required={true}
                                        maxLength={6}
                                        inputMode={"numeric"}
                                        pattern={"[0-9]{6}"}
                                        className={"font-mono text-2xl tracking-widest"}
                                        placeholder={"000000"}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                    {codeError && <ErrorMessage>{codeError}</ErrorMessage>}
                                </Field>
                            )}
                        </codeForm.Field>

                        <PrimaryButton type={"submit"} className={"w-full"}>
                            {t("button.verify")}
                        </PrimaryButton>
                    </FieldGroup>

                    <TextLink className={"text-sm"} href={"/oidc/auth"}>
                        {t("button.back-to-login")}
                    </TextLink>
                </Form>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <Form onSubmit={passwordForm.handleSubmit} className={"grid w-full max-w-sm grid-cols-1 gap-8"}>
                <Heading>{t("heading.set-password", { name: displayName })}</Heading>
                <Text>{t("description.set-password")}</Text>
                <FieldGroup>
                    <passwordForm.Field
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
                    </passwordForm.Field>

                    <passwordForm.Field
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
                    </passwordForm.Field>

                    <PrimaryButton type={"submit"} className={"w-full"}>
                        {t("button.reset-password")}
                    </PrimaryButton>
                </FieldGroup>
            </Form>
        </AuthLayout>
    );
}

export const Route = createFileRoute("/links/reset/")({
    component: ResetPassword,
});
