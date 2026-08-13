import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    ConfirmDialog,
    Heading,
    Table,
    TableBody,
    TableBodySkeleton,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "components";
import { Api } from "src/api/api";
import { AccountSchema } from "src/api/generated";
import { InviteDialog } from "src/components/invite-dialog";
import { StaffFormDialog } from "src/components/staff-form-dialog";
import { LOGIN_CONTEXT } from "src/context/login";
import { formatDate } from "src/utils/dates";

/**
 * Staff account management
 *
 * @returns the page
 */
function Staff() {
    const [t] = useTranslation("admin");
    const [tg] = useTranslation();
    const { me } = React.useContext(LOGIN_CONTEXT);
    const [accounts, setAccounts] = React.useState<AccountSchema[]>();
    const [dialog, setDialog] = React.useState<{ open: boolean; editing?: AccountSchema }>({
        open: false,
    });
    const [invite, setInvite] = React.useState<string>();
    const [deleting, setDeleting] = React.useState<AccountSchema>();

    const fetch = React.useCallback(() => {
        Api.admin.accounts.list().then((r) => setAccounts(r.accounts));
    }, []);
    React.useEffect(fetch, [fetch]);

    return (
        <div className={"flex flex-col gap-6"}>
            <div className={"flex items-center justify-between"}>
                <Heading>{t("heading.staff")}</Heading>
                <Button color={"blue"} onClick={() => setDialog({ open: true })}>
                    {t("button.create-account")}
                </Button>
            </div>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableHeader>{t("label.username")}</TableHeader>
                        <TableHeader>{t("label.role")}</TableHeader>
                        <TableHeader>{t("label.last-login")}</TableHeader>
                        <TableHeader />
                    </TableRow>
                </TableHead>
                {accounts === undefined ? (
                    <TableBodySkeleton rows={3} cols={4} />
                ) : (
                    <TableBody>
                        {accounts.map((account) => (
                            <TableRow key={account.uuid}>
                                <TableCell>{account.username}</TableCell>
                                <TableCell>
                                    {account.role === "Admin" ? t("label.role-admin") : t("label.role-verkauf")}
                                </TableCell>
                                <TableCell>
                                    {account.last_login_at ? formatDate(account.last_login_at) : t("label.never")}
                                </TableCell>
                                <TableCell className={"flex justify-end gap-2"}>
                                    <Button
                                        plain
                                        onClick={() =>
                                            void Api.admin.accounts
                                                .invite(account.uuid)
                                                .then((r) => setInvite(r.registration_link))
                                        }
                                    >
                                        {t("button.new-invite")}
                                    </Button>
                                    <Button plain onClick={() => setDialog({ open: true, editing: account })}>
                                        {tg("button.edit")}
                                    </Button>
                                    <Button
                                        color={"red"}
                                        disabled={account.uuid === me.uuid}
                                        onClick={() => setDeleting(account)}
                                    >
                                        {tg("button.delete")}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                )}
            </Table>

            <StaffFormDialog
                open={dialog.open}
                editing={dialog.editing}
                onClose={() => setDialog({ open: false })}
                onSaved={(inviteLink) => {
                    setDialog({ open: false });
                    setInvite(inviteLink);
                    fetch();
                }}
            />
            <InviteDialog link={invite} onClose={() => setInvite(undefined)} />
            <ConfirmDialog
                open={deleting !== undefined}
                onClose={() => setDeleting(undefined)}
                onConfirm={async () => {
                    await Api.admin.accounts.delete(deleting!.uuid);
                    setDeleting(undefined);
                    fetch();
                }}
                title={t("heading.confirm-delete-account")}
                description={t("description.confirm-delete-account", {
                    name: deleting?.username ?? "",
                })}
            />
        </div>
    );
}

export const Route = createFileRoute("/_auth/admin/staff")({
    component: Staff,
});
