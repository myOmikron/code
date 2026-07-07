import { useTranslation } from "react-i18next";
import { AuthLayout } from "src/components/base/auth-layout";
import { Heading } from "src/components/base/heading";
import { ErrorComponentProps } from "@tanstack/react-router";
import { Text, TextLink } from "src/components/base/text";

/**
 * Props for {@link ResetError}
 */
export type ResetErrorProps = ErrorComponentProps;

/**
 * Error page for credential reset links
 */
export default function ResetError(props: ResetErrorProps) {
    const [t] = useTranslation("reset-error");

    return (
        <AuthLayout>
            <div className={"flex flex-col gap-8"}>
                <Heading>{t("heading.invalid-link")}</Heading>
                <Text className={"max-w-[60ch]"}>{t("heading.explanation")}</Text>
                <TextLink className={"text-sm"} href={"/oidc/auth"}>
                    {t("button.back-to-login")}
                </TextLink>
            </div>
        </AuthLayout>
    );
}
