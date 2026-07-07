import { useTranslation } from "react-i18next";
import { AuthLayout } from "src/components/base/auth-layout";
import { Heading } from "src/components/base/heading";
import { ErrorComponentProps } from "@tanstack/react-router";
import { Text } from "src/components/base/text";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * Props for {@link InviteError}
 */
export type InviteErrorProps = ErrorComponentProps;

/**
 * Error page for invites
 */
export default function InviteError(props: InviteErrorProps) {
    const [t] = useTranslation("invite-error");

    return (
        <AuthLayout>
            <div>
                <ExclamationTriangleIcon className={"z--1 relative dark:text-zinc-700"} />
            </div>
            <div className={"flex flex-col gap-8"}>
                <Heading>{t("heading.invalid-link")}</Heading>
                <Text className={"max-w-[60ch]"}>{t("heading.explanation")}</Text>
            </div>
        </AuthLayout>
    );
}
