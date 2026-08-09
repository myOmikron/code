import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BackButton, Heading, PrimaryButton, Text, notify } from "components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import { handleFormError, isFormError } from "src/utils/error";
import { classifyPasskeyError, registerPasskey } from "src/utils/webauthn";

/**
 * Search params of the register route
 */
export type RegisterSearch = {
    /** The one-time token from the registration link */
    token?: string;
};

export const Route = createFileRoute("/_menu/auth/register")({
    component: RouteComponent,

    validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
        token: typeof search.token === "string" ? search.token : undefined,
    }),
});

function RouteComponent() {
    const [t] = useTranslation("register");
    const navigate = useNavigate();
    const { token } = Route.useSearch();
    const [username, setUsername] = useState<string | "invalid">();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string>();

    useEffect(() => {
        if (!token) {
            setUsername("invalid");
            return;
        }
        let active = true;
        // The ceremony is started again on submit; this call only validates the token and
        // fetches the username to show.
        Api.register
            .start(token)
            .then((response) => {
                if (!active) return;
                setUsername(isFormError(response) ? "invalid" : response.username);
            })
            .catch(() => {
                if (active) setUsername("invalid");
            });
        return () => {
            active = false;
        };
    }, [token]);

    /**
     * Runs the passkey registration ceremony
     */
    async function register() {
        if (!token) return;
        setLoading(true);
        setMessage(undefined);

        const started = await Api.register.start(token);
        if (isFormError(started)) {
            // The link went stale between opening the page and pressing the button.
            setUsername("invalid");
            setLoading(false);
            return;
        }

        let credential: unknown;
        try {
            credential = await registerPasskey(started.options);
        } catch (error) {
            console.error(error);
            setMessage(
                handleFormError(classifyPasskeyError(error), {
                    unsupported: (errors) => {
                        errors.form = t("error.unsupported");
                    },
                    insecure_context: (errors) => {
                        errors.form = t("error.insecure-context");
                    },
                    wrong_domain: (errors) => {
                        errors.form = t("error.wrong-domain");
                    },
                    no_passkey_or_aborted: (errors) => {
                        errors.form = t("error.aborted");
                    },
                    already_registered: (errors) => {
                        errors.form = t("error.already-registered");
                    },
                    authenticator_error: (errors) => {
                        errors.form = t("error.authenticator-error");
                    },
                    unknown: (errors) => {
                        errors.form = t("error.unknown");
                    },
                }).form,
            );
            setLoading(false);
            return;
        }

        const finished = await Api.register.finish(token, credential);
        if (isFormError(finished)) {
            const { error } = finished;
            if (error.token_invalid || error.token_used || error.token_expired) {
                setUsername("invalid");
            } else if (error.already_registered) {
                setMessage(t("error.already-registered"));
            } else {
                setMessage(t("error.rejected"));
            }
            setLoading(false);
            return;
        }

        notify.success(t("toast.passkey-created"));
        await navigate({ to: "/auth/login" });
    }

    // Nothing to show until the token is validated; flashing the form first is worse.
    if (username === undefined) {
        return null;
    }

    if (username === "invalid") {
        return (
            <div className={"flex h-full w-full items-center justify-center"}>
                <div className={"flex w-full max-w-sm flex-col gap-4"}>
                    <Heading>{t("heading.register")}</Heading>
                    <InlineError>{t("error.invalid-token")}</InlineError>
                    <BackButton href={"/auth/signup"}>{t("button.back-to-signup")}</BackButton>
                </div>
            </div>
        );
    }

    return (
        <div className={"flex h-full w-full items-center justify-center"}>
            <div className={"flex w-full max-w-sm flex-col gap-6"}>
                <div className={"flex flex-col gap-3"}>
                    <Heading>{t("heading.register")}</Heading>
                    <Text>{t("description.register", { username })}</Text>
                </div>
                <PrimaryButton className={"w-full"} loading={loading} onClick={() => void register()}>
                    {t("button.create-passkey")}
                </PrimaryButton>
                {message !== undefined && <InlineError>{message}</InlineError>}
            </div>
        </div>
    );
}
