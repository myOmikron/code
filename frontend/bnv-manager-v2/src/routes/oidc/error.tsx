import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AuthLayout } from "src/components/base/auth-layout";
import { Heading } from "src/components/base/heading";
import { useTranslation } from "react-i18next";
import React from "react";
import Logo from "src/assets/bnv.svg?react";
import { PrimaryButton } from "src/components/base/button";
import { OidcErrorCode, validateOidcErrorSearch } from "src/utils/oidc";

/**
 * Props for {@link OidcError}
 */
export type OidcErrorProps = {};

/**
 * Displayable errors while using oidc
 */
export default function OidcError(props: OidcErrorProps) {
    const [t] = useTranslation("oidc-error");

    const search = Route.useSearch();
    const router = useRouter();

    return (
        <AuthLayout>
            <div className={"flex flex-col justify-center gap-6"}>
                <Logo className={"h-8 w-fit dark:text-white"} />
                <Heading className={"mt-12"}>{t("heading.error")}</Heading>
                <span>{t(search.error ? MESSAGES[search.error] : "description.unknown")}</span>
                <PrimaryButton onClick={() => router.navigate({ to: "/" })}>{t("button.back-to-home")}</PrimaryButton>
            </div>
        </AuthLayout>
    );
}

/** Translation key of the message for each known error code */
const MESSAGES: Record<OidcErrorCode, string> = {
    "unknown-request": "description.unknown-request",
    "unknown-client": "description.unknown-client",
    "invalid-redirect-uri": "description.invalid-redirect-uri",
};

export const Route = createFileRoute("/oidc/error")({
    component: OidcError,
    validateSearch: validateOidcErrorSearch,
});
