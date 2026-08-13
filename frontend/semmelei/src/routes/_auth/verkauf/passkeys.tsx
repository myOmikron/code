import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    ConfirmDialog,
    Heading,
    Skeleton,
    StackedList,
    StackedListDescription,
    StackedListFlexRow,
    StackedListItem,
    StackedListTitle,
} from "components";
import { Api } from "src/api/api";
import { ListPasskeysResponse, PasskeySchema } from "src/api/generated";
import { InlineError } from "src/components/inline-error";
import { formatDate } from "src/utils/dates";
import { registerPasskey } from "src/utils/webauthn";

/**
 * Manage the logged-in account's passkeys
 *
 * @returns the page
 */
function Passkeys() {
    const [t] = useTranslation("verkauf");
    const [tg] = useTranslation();
    const [passkeys, setPasskeys] = React.useState<ListPasskeysResponse>();
    const [adding, setAdding] = React.useState(false);
    const [deleting, setDeleting] = React.useState<PasskeySchema>();
    const [error, setError] = React.useState(false);

    const fetch = React.useCallback(() => {
        Api.auth.passkeys.list().then(setPasskeys);
    }, []);
    React.useEffect(fetch, [fetch]);

    /**
     * Register another passkey on this device (no name asked — auto-assigned)
     */
    async function addPasskey() {
        setAdding(true);
        setError(false);
        try {
            const { options } = await Api.auth.passkeys.startAdd();
            const credential = await registerPasskey(options);
            await Api.auth.passkeys.finishAdd(credential);
            fetch();
        } catch (e) {
            console.error(e);
            setError(true);
        } finally {
            setAdding(false);
        }
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <Heading>{t("heading.passkeys")}</Heading>
                <Button color={"blue"} loading={adding} onClick={() => void addPasskey()}>
                    {t("button.add-passkey")}
                </Button>
            </div>

            {error && <InlineError>{t("error.passkey-failed")}</InlineError>}

            {passkeys === undefined ? (
                <Skeleton variant={"card"} />
            ) : (
                <StackedList>
                    {passkeys.passkeys.map((passkey) => (
                        <StackedListFlexRow key={passkey.uuid}>
                            <StackedListItem>
                                <StackedListTitle>{passkey.label}</StackedListTitle>
                                <StackedListDescription>
                                    {t("label.created")}: {formatDate(passkey.created_at)}
                                    {" · "}
                                    {t("label.last-used")}:{" "}
                                    {passkey.last_used_at ? formatDate(passkey.last_used_at) : t("label.never")}
                                </StackedListDescription>
                            </StackedListItem>
                            <Button
                                color={"red"}
                                disabled={passkeys.passkeys.length <= 1}
                                onClick={() => setDeleting(passkey)}
                            >
                                {tg("button.delete")}
                            </Button>
                        </StackedListFlexRow>
                    ))}
                </StackedList>
            )}

            <ConfirmDialog
                open={deleting !== undefined}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    try {
                        await Api.auth.passkeys.delete(deleting!.uuid);
                    } catch {
                        setError(true);
                    }
                    setDeleting(undefined);
                    fetch();
                }}
                title={t("heading.confirm-delete-passkey")}
                description={t("description.confirm-delete-passkey")}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/verkauf/passkeys")({
    component: Passkeys,
});
