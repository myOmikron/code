import { createFileRoute } from "@tanstack/react-router";
import { KeyIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    PrimaryButton,
    StackedList,
    StackedListFlexRow,
    Strong,
    Subheading,
    Text,
    notify,
} from "components";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { InlineError } from "src/components/inline-error";
import type { SimplePasskey } from "src/api/generated";
import { formatDateTime } from "src/utils/format";
import { handleFormError, isFormError } from "src/utils/error";
import { classifyPasskeyError, registerPasskey } from "src/utils/webauthn";

export const Route = createFileRoute("/_menu/profile/_profile/security")({
    component: RouteComponent,
});

/**
 * Passkey management: which devices can sign in, adding one, removing one.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("profile");
    const [passkeys, setPasskeys] = useState<SimplePasskey[] | null>(null);
    const [adding, setAdding] = useState(false);
    const [message, setMessage] = useState<string>();
    const [confirming, setConfirming] = useState<SimplePasskey | null>(null);

    const refresh = useCallback(async () => {
        setPasskeys((await Api.accounts.passkeys.list()).passkeys);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    /**
     * Registers the current device as another passkey
     */
    async function addPasskey() {
        setAdding(true);
        setMessage(undefined);

        let credential: unknown;
        try {
            const { options } = await Api.accounts.passkeys.startAdd();
            credential = await registerPasskey(options);
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
            setAdding(false);
            return;
        }

        const finished = await Api.accounts.passkeys.finishAdd(credential);
        if (isFormError(finished)) {
            setMessage(
                handleFormError(finished.error, {
                    no_ceremony: (errors) => {
                        errors.form = t("error.rejected");
                    },
                    malformed_credential: (errors) => {
                        errors.form = t("error.rejected");
                    },
                    registration_failed: (errors) => {
                        errors.form = t("error.rejected");
                    },
                    already_registered: (errors) => {
                        errors.form = t("error.already-registered");
                    },
                }).form,
            );
            setAdding(false);
            return;
        }

        notify.success(t("toast.passkey-added"));
        await refresh();
        setAdding(false);
    }

    /**
     * Removes a passkey after the confirmation was accepted
     *
     * @param passkey the entry to delete
     */
    async function remove(passkey: SimplePasskey) {
        setConfirming(null);
        const response = await Api.accounts.passkeys.delete(passkey.uuid);
        if (isFormError(response)) {
            // Both cases mean the list on screen is stale — another tab got there first.
            await refresh();
            return;
        }
        notify.success(t("toast.passkey-removed"));
        await refresh();
    }

    // The last one cannot go: the invite flow only issues a token while an account has none,
    // so there would be no way back in.
    const isLast = passkeys !== null && passkeys.length <= 1;

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex flex-col gap-2"}>
                <Subheading>{t("heading.passkeys")}</Subheading>
                <Text>{t("description.passkeys")}</Text>
            </div>

            {passkeys !== null && (
                <StackedList>
                    {passkeys.map((passkey) => (
                        <StackedListFlexRow key={passkey.uuid} className={"gap-4"}>
                            <KeyIcon className={"mt-1 size-5 shrink-0 text-zinc-400 dark:text-zinc-500"} />
                            <div className={"flex min-w-0 flex-1 flex-col gap-1.5"}>
                                <Strong className={"block truncate"}>{passkey.label}</Strong>
                                <div className={"flex flex-wrap items-center gap-2"}>
                                    {passkey.last_used_at === null || passkey.last_used_at === undefined ? (
                                        <Badge color={"zinc"}>{t("label.never-used")}</Badge>
                                    ) : (
                                        <Badge color={"green"}>
                                            {t("label.last-used", { date: formatDateTime(passkey.last_used_at) })}
                                        </Badge>
                                    )}
                                    {isLast && <Badge color={"blue"}>{t("label.only-passkey")}</Badge>}
                                </div>
                                <Text className={"text-xs"}>
                                    {t("label.added-on", { date: formatDateTime(passkey.created_at) })}
                                </Text>
                            </div>
                            <Button
                                plain
                                disabled={isLast}
                                aria-label={t("accessibility.remove-passkey", { label: passkey.label })}
                                onClick={() => setConfirming(passkey)}
                            >
                                <TrashIcon className={"size-5"} />
                            </Button>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
            )}

            <div className={"flex flex-col gap-2"}>
                <PrimaryButton className={"self-start"} loading={adding} onClick={() => void addPasskey()}>
                    {t("button.add-passkey")}
                </PrimaryButton>
                <Text>{t("description.add-passkey")}</Text>
                {message !== undefined && <InlineError>{message}</InlineError>}
            </div>

            <Alert open={confirming !== null} onClose={() => setConfirming(null)}>
                <AlertTitle>{t("heading.remove-passkey")}</AlertTitle>
                <AlertDescription>
                    {t("description.remove-passkey", { label: confirming?.label ?? "" })}
                </AlertDescription>
                <AlertActions>
                    <Button plain onClick={() => setConfirming(null)}>
                        {t("button.cancel")}
                    </Button>
                    <Button color={"red"} onClick={() => void (confirming && remove(confirming))}>
                        {t("button.remove-passkey")}
                    </Button>
                </AlertActions>
            </Alert>
        </div>
    );
}
