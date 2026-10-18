import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import { useTranslation } from "react-i18next";
import type { AdminAccount } from "src/api/generated";
import { AdminRoleBadge } from "src/components/admin-role-badge";
import { formatDate } from "src/utils/format";

/**
 * The properties for {@link AdminAccountTable}
 */
export type AdminAccountTableProps = {
    /** The Accounts, in the order to show them */
    accounts: Array<AdminAccount>;
};

/**
 * The admin list of Accounts, each row linking to the Account's detail page
 *
 * @returns the table
 */
export function AdminAccountTable({ accounts }: AdminAccountTableProps) {
    const [t] = useTranslation("admin");

    return (
        <Table striped={true}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.username")}</TableHeader>
                    <TableHeader className={"max-md:hidden"}>{t("label.email")}</TableHeader>
                    <TableHeader>{t("label.role")}</TableHeader>
                    <TableHeader className={"max-sm:hidden"}>{t("label.created-at")}</TableHeader>
                    <TableHeader className={"text-right max-sm:hidden"}>{t("label.collections")}</TableHeader>
                    <TableHeader className={"text-right max-sm:hidden"}>{t("label.decks")}</TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {accounts.map((account) => (
                    <TableRow
                        key={account.uuid}
                        href={"/admin/accounts/$accountUuid"}
                        params={{ accountUuid: account.uuid }}
                        title={account.username}
                    >
                        <TableCell className={"font-medium"}>{account.username}</TableCell>
                        <TableCell className={"max-md:hidden"}>
                            <Text>{account.email}</Text>
                        </TableCell>
                        <TableCell>
                            <AdminRoleBadge role={account.role} />
                        </TableCell>
                        <TableCell className={"max-sm:hidden"}>{formatDate(account.created_at)}</TableCell>
                        <TableCell className={"text-right tabular-nums max-sm:hidden"}>{account.collections}</TableCell>
                        <TableCell className={"text-right tabular-nums max-sm:hidden"}>{account.decks}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
