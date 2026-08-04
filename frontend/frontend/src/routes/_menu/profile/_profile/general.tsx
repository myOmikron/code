import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import ACCOUNT_CONTEXT from "src/context/account";
import Form from "src/components/base/form";
import { useForm, useStore } from "@tanstack/react-form";
import { Field, FieldGroup, Fieldset, Label } from "src/components/base/fieldset";
import { Input } from "src/components/base/input";
import { Divider } from "src/components/base/divider";
import LanguageSelect, { Lang } from "src/components/base/language-select";
import { Listbox, ListboxLabel, ListboxOption } from "src/components/base/listbox";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import { Button, PrimaryButton } from "src/components/base/button";
import { Api } from "src/api/api";

/**
 * Props for {@link Profile}
 */
export type ProfileProps = {};

/**
 * Profile settings
 */
export default function Profile(props: ProfileProps) {
    const [t, i18n] = useTranslation("profile");
    const [tg] = useTranslation();

    const account = React.useContext(ACCOUNT_CONTEXT);

    const form = useForm({
        defaultValues: {
            displayName: account.account.display_name,
            preferredLanguage: (localStorage.getItem("preferredLang") ?? "DE") as Lang,
            theme: (localStorage.getItem("theme") ?? "system") as "system" | "light" | "dark",
        },
        onSubmit: async ({ value }) => {
            localStorage.setItem("preferredLang", value.preferredLanguage);
            await i18n.changeLanguage(value.preferredLanguage.toLowerCase());

            if (value.theme === "system") {
                localStorage.removeItem("theme");
            } else if (value.theme === "light") {
                localStorage.setItem("theme", "light");
            } else {
                localStorage.setItem("theme", "dark");
            }

            if (
                localStorage.theme === "dark" ||
                (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
            ) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }

            await Api.common.me.update({ display_name: value.displayName });

            form.reset();
        },
    });
    const isDirty = useStore(form.store, (store) => store.isDirty);

    return (
        <Form onSubmit={form.handleSubmit}>
            <Fieldset>
                <FieldGroup>
                    <div className="grid w-full grid-cols-1 items-center gap-x-4 gap-y-6 sm:grid-cols-2">
                        <form.Field name={"displayName"}>
                            {(fieldApi) => (
                                <Field className="grid grid-cols-subgrid gap-3 sm:col-span-2">
                                    <Label>{t("label.display-name")}</Label>
                                    <Input
                                        required={true}
                                        value={fieldApi.state.value}
                                        onChange={(e) => fieldApi.handleChange(e.target.value)}
                                    />
                                </Field>
                            )}
                        </form.Field>
                    </div>

                    <Divider />

                    <div className="grid w-full grid-cols-1 items-center gap-x-4 gap-y-6 sm:grid-cols-2">
                        <form.Field name={"preferredLanguage"}>
                            {(fieldApi) => (
                                <Field className="grid grid-cols-subgrid gap-3 sm:col-span-2">
                                    <Label>{t("label.preferred-lang")}</Label>
                                    <LanguageSelect lang={fieldApi.state.value} setLang={fieldApi.handleChange} />
                                </Field>
                            )}
                        </form.Field>
                    </div>
                    <div className="grid w-full grid-cols-1 items-center gap-x-4 gap-y-6 sm:grid-cols-2">
                        <form.Field name={"theme"}>
                            {(fieldApi) => (
                                <Field className="grid grid-cols-subgrid gap-3 sm:col-span-2">
                                    <Label>{t("label.theme")}</Label>
                                    <Listbox value={fieldApi.state.value} onChange={fieldApi.handleChange}>
                                        <ListboxOption value={"system"}>
                                            <ComputerDesktopIcon />
                                            <ListboxLabel>{t("label.theme-system")}</ListboxLabel>
                                        </ListboxOption>
                                        <ListboxOption value={"light"}>
                                            <SunIcon />
                                            <ListboxLabel>{t("label.theme-light")}</ListboxLabel>
                                        </ListboxOption>
                                        <ListboxOption value={"dark"}>
                                            <MoonIcon />
                                            <ListboxLabel>{t("label.theme-dark")}</ListboxLabel>
                                        </ListboxOption>
                                    </Listbox>
                                </Field>
                            )}
                        </form.Field>
                    </div>

                    <Divider />

                    <div className={"flex justify-end gap-4"}>
                        <Button disabled={!isDirty} outline={true} onClick={() => form.reset()}>
                            {tg("button.reset")}
                        </Button>
                        <PrimaryButton disabled={!isDirty} type={"submit"}>
                            {tg("button.save")}
                        </PrimaryButton>
                    </div>
                </FieldGroup>
            </Fieldset>
        </Form>
    );
}

export const Route = createFileRoute("/_menu/profile/_profile/general")({
    component: Profile,
});
