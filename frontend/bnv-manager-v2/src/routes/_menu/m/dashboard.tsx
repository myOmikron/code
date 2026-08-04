import { createFileRoute } from "@tanstack/react-router";

import React from "react";
import { useTranslation } from "react-i18next";
import HeadingLayout from "src/components/base/heading-layout";
import ACCOUNT_CONTEXT from "src/context/account";
import MailcowLogo from "src/assets/mailcow.svg?react";
import { Subheading } from "src/components/base/heading";
import { KeyIcon } from "@heroicons/react/24/outline";
import { Link } from "src/components/base/link";
import { Api } from "src/api/api";

/**
 * The properties for {@link MemberDashboard}
 */
export type MemberDashboardProps = {};

/**
 * Dashboard for members
 */
export default function MemberDashboard(props: MemberDashboardProps) {
    const [t] = useTranslation("member-dashboard");

    const data = Route.useLoaderData();

    const ctx = React.useContext(ACCOUNT_CONTEXT);

    return (
        <HeadingLayout heading={t("heading.hello", { name: ctx.account.display_name })}>
            <Subheading>{t("heading.quick-access")}</Subheading>
            <div className={"grid gap-6 lg:grid-cols-3"}>
                <a
                    href={data.mailcow_url + "/?iam_sso=1"}
                    target={"_blank"}
                    className={
                        "flex items-center gap-8 rounded-lg border bg-zinc-50 p-5 duration-75 hover:border-orange-500 dark:border-zinc-700 dark:bg-zinc-800"
                    }
                >
                    <MailcowLogo className={"size-10"} />
                    <Subheading>{t("button.mail-configuration-interface")}</Subheading>
                </a>
                <Link
                    href={"/profile/security"}
                    className={
                        "flex items-center gap-8 rounded-lg border bg-zinc-50 p-5 duration-75 hover:border-orange-500 dark:border-zinc-700 dark:bg-zinc-800"
                    }
                >
                    <KeyIcon className={"size-10 dark:text-zinc-300"} />
                    <Subheading>{t("button.security-settings")}</Subheading>
                </Link>
            </div>
        </HeadingLayout>
    );
}

export const Route = createFileRoute("/_menu/m/dashboard")({
    component: MemberDashboard,
    loader: async () => await Api.common.settings.get(),
});
