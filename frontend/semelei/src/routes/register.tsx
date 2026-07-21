import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout, Heading, PrimaryButton, Text, notify } from "components";
import Logo from "src/assets/logo.svg?react";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import { registerPasskey } from "src/utils/webauthn";

/**
 * Search params of the register route
 */
export type RegisterSearch = {
    /** The one-time invite token */
    token?: string;
};

/**
 * Invite-based passkey registration
 *
 * The link (`/register?token=...`) comes from the cli (first admin)
 * or from the admin UI (new staff / lost device). One button, no device
 * name to type — the server auto-names the passkey.
 *
 * @returns the page
 */
function Register() {
    const [t] = useTranslation("login");
    const navigate = useNavigate();
    const search = Route.useSearch();
    const [username, setUsername] = React.useState<string | "invalid">();
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        if (!search.token) {
            setUsername("invalid");
            return;
        }
        // The started ceremony is re-started on submit; this call only
        // validates the token and fetches the username for display.
        Api.auth
            .startRegistration(search.token)
            .then((response) => setUsername(response.username))
            .catch(() => setUsername("invalid"));
    }, [search.token]);

    /**
     * Run the passkey registration ceremony
     */
    async function register() {
        if (!search.token) return;
        setLoading(true);
        setFailed(false);
        try {
            const { options } = await Api.auth.startRegistration(search.token);
            const credential = await registerPasskey(options);
            await Api.auth.finishRegistration(search.token, credential);
            notify.success(t("toast.passkey-created"));
            await navigate({ to: "/login" });
        } catch (e) {
            console.error(e);
            setFailed(true);
            setLoading(false);
        }
    }

    if (username === undefined) {
        return <AuthLayout>{undefined}</AuthLayout>;
    }

    if (username === "invalid") {
        return (
            <AuthLayout>
                <div className={"flex w-full max-w-sm flex-col items-center gap-4"}>
                    <Logo className={"size-14"} />
                    <Heading>{t("heading.register")}</Heading>
                    <InlineError>{t("error.invalid-token")}</InlineError>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className={"flex w-full max-w-sm flex-col gap-6"}>
                <div className={"flex flex-col items-center gap-3"}>
                    <Logo className={"size-14"} />
                    <Heading>{t("heading.register")}</Heading>
                    <Text className={"text-center"}>{t("description.register", { username })}</Text>
                </div>
                <PrimaryButton className={"w-full"} loading={loading} onClick={() => void register()}>
                    {t("button.create-passkey")}
                </PrimaryButton>
                {failed && <InlineError>{t("error.login-failed")}</InlineError>}
            </div>
        </AuthLayout>
    );
}

export const Route = createFileRoute("/register")({
    component: Register,

    validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
        token: typeof search.token === "string" ? search.token : undefined,
    }),
});
