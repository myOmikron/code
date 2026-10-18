import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
    Badge,
    Button,
    ConfirmDialog,
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Subheading,
    Text,
    notify,
} from "components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Role } from "src/api/generated";
import { AdminDeleteAccountDialog } from "src/components/admin-delete-account-dialog";
import { AdminLockDialog } from "src/components/admin-lock-dialog";
import { AdminLogEntries } from "src/components/admin-log-entries";
import { AdminRoleBadge } from "src/components/admin-role-badge";
import { useAccount } from "src/context/account";
import { isFormError } from "src/utils/error";
import { formatDate } from "src/utils/format";
import { useLoaded } from "src/utils/use-loaded";

export const Route = createFileRoute("/_menu/admin/accounts/$accountUuid")({
    component: RouteComponent,
});

/**
 * One Account as an Admin sees it: what it owns, its Role and Lock to change, and what
 * Admins did to it so far.
 *
 * @returns the page
 */
function RouteComponent() {
    const [t] = useTranslation("admin");
    const { accountUuid } = Route.useParams();
    const me = useAccount();
    const navigate = useNavigate();

    const { data: detail, reload } = useLoaded(() => Api.admin.accounts.get(accountUuid), [accountUuid]);
    const [confirming, setConfirming] = useState(false);
    const [locking, setLocking] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [logVersion, setLogVersion] = useState(0);

    if (detail === null) return <Text>{t("label.loading")}</Text>;

    const { account } = detail;
    const own = me.account?.uuid === account.uuid;
    const nextRole = account.role === Role.Admin ? Role.Member : Role.Admin;

    /**
     * Gives the Account the other Role
     */
    async function changeRole() {
        const response = await Api.admin.accounts.setRole(account.uuid, nextRole);
        if (isFormError(response)) {
            notify.error(t("error.own-account"));
            return;
        }
        setConfirming(false);
        reload();
        setLogVersion((held) => held + 1);
        notify.success(t("toast.role-changed"));
    }

    /**
     * Closes the Lock dialog after the Lock was set or lifted and reads the Account again
     */
    function lockChanged() {
        const wasLocked = account.lock !== null && account.lock !== undefined;
        setLocking(false);
        reload();
        setLogVersion((held) => held + 1);
        notify.success(wasLocked ? t("toast.unlocked") : t("toast.locked"));
    }

    return (
        <div className={"flex flex-col gap-6"}>
            <Link
                to={"/admin/accounts"}
                className={
                    "flex items-center gap-1 text-sm text-zinc-500 hover:text-(--color-accent) hover:underline dark:text-zinc-400"
                }
            >
                <ChevronLeftIcon className={"size-4"} /> {t("button.back-to-accounts")}
            </Link>

            <Subheading>{account.username}</Subheading>

            <DescriptionList>
                <DescriptionTerm>{t("label.email")}</DescriptionTerm>
                <DescriptionDetails>{account.email}</DescriptionDetails>
                <DescriptionTerm>{t("label.role")}</DescriptionTerm>
                <DescriptionDetails>
                    <AdminRoleBadge role={account.role} />
                </DescriptionDetails>
                <DescriptionTerm>{t("label.lock")}</DescriptionTerm>
                <DescriptionDetails>
                    {account.lock ? (
                        <div className={"flex flex-col items-start gap-1"}>
                            <Badge color={"red"}>
                                {t("label.locked-since", { date: formatDate(account.lock.locked_at) })}
                            </Badge>
                            <Text>{account.lock.reason}</Text>
                        </div>
                    ) : (
                        <Text>{t("label.not-locked")}</Text>
                    )}
                </DescriptionDetails>
                <DescriptionTerm>{t("label.created-at")}</DescriptionTerm>
                <DescriptionDetails>{formatDate(account.created_at)}</DescriptionDetails>
                <DescriptionTerm>{t("label.collections")}</DescriptionTerm>
                <DescriptionDetails>{account.collections}</DescriptionDetails>
                <DescriptionTerm>{t("label.decks")}</DescriptionTerm>
                <DescriptionDetails>{account.decks}</DescriptionDetails>
                <DescriptionTerm>{t("label.cards")}</DescriptionTerm>
                <DescriptionDetails>{detail.cards}</DescriptionDetails>
                <DescriptionTerm>{t("label.passkeys")}</DescriptionTerm>
                <DescriptionDetails>{detail.passkeys}</DescriptionDetails>
            </DescriptionList>

            <div className={"flex flex-col items-start gap-2"}>
                <div className={"flex flex-wrap gap-2"}>
                    <Button outline={true} disabled={own} onClick={() => setConfirming(true)}>
                        {nextRole === Role.Admin ? t("button.make-admin") : t("button.make-member")}
                    </Button>
                    <Button outline={true} disabled={own} onClick={() => setLocking(true)}>
                        {account.lock ? t("button.unlock") : t("button.lock")}
                    </Button>
                    <Button color={"red"} disabled={own} onClick={() => setDeleting(true)}>
                        {t("button.delete")}
                    </Button>
                </div>
                {own && <Text>{t("description.own-account")}</Text>}
            </div>

            <div className={"flex flex-col gap-4"}>
                <Subheading>{t("heading.log")}</Subheading>
                <AdminLogEntries account={account.uuid} version={logVersion} />
            </div>

            <AdminLockDialog open={locking} account={account} onClose={() => setLocking(false)} onDone={lockChanged} />

            <AdminDeleteAccountDialog
                open={deleting}
                account={account}
                onClose={() => setDeleting(false)}
                onDeleted={() => navigate({ to: "/admin/accounts" })}
            />

            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={changeRole}
                title={t("heading.change-role")}
                description={t(nextRole === Role.Admin ? "description.make-admin" : "description.make-member", {
                    username: account.username,
                })}
                confirmLabel={nextRole === Role.Admin ? t("button.make-admin") : t("button.make-member")}
                confirmColor={"blue"}
            />
        </div>
    );
}
