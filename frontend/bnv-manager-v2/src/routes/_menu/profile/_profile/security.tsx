import { createFileRoute } from "@tanstack/react-router";

import { useTranslation } from "react-i18next";
import { Subheading } from "src/components/base/heading";
import Form from "src/components/base/form";
import { Fieldset } from "@headlessui/react";
import { useForm, useStore } from "@tanstack/react-form";
import { ErrorMessage, Field, FieldGroup, Label } from "src/components/base/fieldset";
import { Input } from "src/components/base/input";
import { Button, PrimaryButton } from "src/components/base/button";
import { Api } from "src/api/api";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { zxcvbn } from "@zxcvbn-ts/core";
import React, { lazy, Suspense } from "react";
import { toast } from "react-toastify";
import ACCOUNT_CONTEXT from "src/context/account";

const PasswordStrength = lazy(() => import("src/components/base/pw-strength"));

/**
 * Props for {@link ProfileSecurity}
 */
export type ProfileSecurityProps = {};

/**
 * Security settings
 */
export default function ProfileSecurity(props: ProfileSecurityProps) {
    const [t] = useTranslation("profile");
    const [tg] = useTranslation();

    const account = React.useContext(ACCOUNT_CONTEXT);

    const form = useForm({
        defaultValues: {
            oldPassword: "",
            password: "",
            password2: "",
            showPassword: false,
        },
        validators: {
            onSubmitAsync: async ({ value }) => {
                const id = toast.loading(t("toast.setting-password"));

                const res = await Api.common.me.setPassword({
                    old_password: value.oldPassword,
                    password: value.password,
                });
                if (res.result === "Err") {
                    const errMsg = res.error.invalid_old_password
                        ? t("error.invalid-old-password")
                        : t("text.stronger-password");

                    toast.update(id, {
                        autoClose: 2500,
                        render: errMsg,
                        type: "error",
                        isLoading: false,
                        closeOnClick: true,
                    });

                    return;
                }

                toast.update(id, {
                    autoClose: 2500,
                    render: t("toast.password-set"),
                    type: "success",
                    isLoading: false,
                    closeOnClick: true,
                });
                form.reset();
                account.reset(false);
            },
        },
    });

    const showPassword = useStore(form.store, (store) => store.values.showPassword);
    const isDirty = useStore(form.store, (store) => store.isDirty);

    return (
        <div>
            <Subheading>{t("heading.password")}</Subheading>
            <Form onSubmit={form.handleSubmit} className={"mt-4 max-w-lg"}>
                <Fieldset>
                    <FieldGroup>
                        <form.Field name={"oldPassword"}>
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.old-password")}</Label>
                                    <Input
                                        autoComplete={"current-password"}
                                        type={"password"}
                                        required={true}
                                        value={fieldApi.state.value}
                                        onBlur={fieldApi.handleBlur}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>

                        <form.Field
                            name={"password"}
                            validators={{
                                onChange: ({ value }) => {
                                    if (
                                        value !== "" &&
                                        zxcvbn(value, [account.account.username, account.account.display_name]).score <
                                            3
                                    ) {
                                        return t("text.stronger-password");
                                    }
                                    return undefined;
                                },
                            }}
                        >
                            {(fieldApi) => (
                                <>
                                    <Field>
                                        <Label>{t("label.password")}</Label>
                                        <div className={"mt-3 flex gap-3"}>
                                            <Input
                                                autoComplete={"new-password"}
                                                type={showPassword ? "text" : "password"}
                                                required={true}
                                                value={fieldApi.state.value}
                                                onBlur={fieldApi.handleBlur}
                                                onChange={(e) => fieldApi.handleChange(e.target.value)}
                                            />
                                            <form.Field name={"showPassword"}>
                                                {(field) => (
                                                    <Button
                                                        outline={true}
                                                        onClick={() => field.handleChange((prev) => !prev)}
                                                    >
                                                        {field.state.value ? <EyeSlashIcon /> : <EyeIcon />}
                                                    </Button>
                                                )}
                                            </form.Field>
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
                                onChange: ({ value, fieldApi }) => {
                                    if (
                                        fieldApi.getMeta().isDirty &&
                                        value !== fieldApi.form.getFieldValue("password")
                                    ) {
                                        return t("error.password-mismatch");
                                    }
                                    return undefined;
                                },
                            }}
                        >
                            {(fieldApi) => (
                                <Field>
                                    <Label>{t("label.repeat-password")}</Label>
                                    <Input
                                        autoComplete={"new-password"}
                                        required={true}
                                        type={"password"}
                                        invalid={fieldApi.state.meta.errors.length !== 0}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                    {fieldApi.state.meta.errors.map((err) => (
                                        <ErrorMessage>{err}</ErrorMessage>
                                    ))}
                                </Field>
                            )}
                        </form.Field>

                        <div className={"flex justify-end gap-4"}>
                            <PrimaryButton disabled={!isDirty} type={"submit"}>
                                {tg("button.save")}
                            </PrimaryButton>
                        </div>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </div>
    );
}

export const Route = createFileRoute("/_menu/profile/_profile/security")({
    component: ProfileSecurity,
});
