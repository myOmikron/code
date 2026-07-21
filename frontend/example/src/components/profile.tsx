import React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/20/solid";
import {
    Button,
    Divider,
    Field,
    FieldGroup,
    Fieldset,
    Form,
    HeadingLayout,
    Label,
    Lang,
    LanguageSelect,
    Listbox,
    ListboxLabel,
    ListboxOption,
    PrimaryButton,
} from "components";

/**
 * The properties for {@link Profile}
 */
export type ProfileProps = {};

/**
 * The settings for this site
 */
export default function Profile(props: ProfileProps) {
    const [t, i18n] = useTranslation("profile");
    const [tg] = useTranslation();

    const theme = localStorage.getItem("theme");
    const preferredLang = localStorage.getItem("preferredLang");

    const form = useForm({
        defaultValues: {
            theme: theme ? theme : "system",
            preferredLanguage: preferredLang ? (preferredLang as Lang) : "EN",
        },
        // eslint-disable-next-line
        onSubmit: async ({ formApi, value }) => {
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
        },
    });

    // TODO: if you have a valid api
    // /**
    // * Logout of an account and redirect to the login page on success
    // */
    //const logout = async () => {
    //    await Api.auth.logout().then(() => reset());
    //};

    return (
        <HeadingLayout heading={t("heading.profile")}>
            <Form onSubmit={form.handleSubmit}>
                <Fieldset>
                    <FieldGroup>
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
                        <div className={"flex justify-between"}>
                            <div className={"flex justify-end"}>
                                <Button plain={true} onClick={() => {}}>
                                    {tg("button.logout")}
                                </Button>
                            </div>
                            <div className={"flex justify-end"}>
                                <PrimaryButton type={"submit"}>{tg("button.save")}</PrimaryButton>
                            </div>
                        </div>
                    </FieldGroup>
                </Fieldset>
            </Form>
        </HeadingLayout>
    );
}
