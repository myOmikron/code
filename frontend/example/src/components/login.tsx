import { useTranslation } from "react-i18next";
import React from "react";
import { Button } from "components";

import LogoText from "src/assets/logo_text.svg?react";

/**
 * The properties for {@link Login}
 */
export type LoginProps = {
    /** The function that should be executed on a successful login */
    onLogin: () => void;
};

/**
 * The login.json component
 */
export default function Login(props: LoginProps) {
    const [t] = useTranslation("login");

    return (
        <div className={"flex h-screen w-full items-center justify-center bg-zinc-50 p-3 dark:bg-neutral-950"}>
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:before:pointer-events-none forced-colors:outline">
                <div className={"flex flex-col gap-6 p-12"}>
                    <LogoText
                        className={
                            "h-20 w-full fill-[#233F94] p-3 drop-shadow-lg dark:fill-white dark:drop-shadow-none"
                        }
                    />

                    <Button
                        color={"blue"}
                        type={"submit"}
                        className={"w-full"}
                        external={true}
                        href={"/api/frontend/v1/oidc/begin-login"}
                    >
                        {t("button.sign-in-sso")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
