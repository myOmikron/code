import { Link } from "@tanstack/react-router";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "components";
import { useTranslation } from "react-i18next";
import { DeletionMode, Role } from "src/api/generated";
import type { AdminLogAction, AdminLogEntryResponse } from "src/api/generated";
import { formatDateTime } from "src/utils/format";

/**
 * The properties for {@link AdminLogTable}
 */
export type AdminLogTableProps = {
    /** The entries, newest first */
    entries: Array<AdminLogEntryResponse>;
    /** Whether to name the affected Account, left out on that Account's own page */
    showAccount: boolean;
};

/**
 * Entries of the Admin log: who did what to whom, when and why
 *
 * Both Accounts are named by their username at the time; one that is gone since
 * is still named, just no longer linked.
 *
 * @returns the table
 */
export function AdminLogTable({ entries, showAccount }: AdminLogTableProps) {
    const [t] = useTranslation("admin");

    /**
     * What an entry records, in words
     *
     * @param action the entry's action
     * @returns the action as a badge
     */
    function badge(action: AdminLogAction) {
        switch (action.kind) {
            case "Lock":
                return <Badge color={"red"}>{t("label.action-lock")}</Badge>;
            case "Unlock":
                return <Badge color={"green"}>{t("label.action-unlock")}</Badge>;
            case "RoleChange":
                return (
                    <Badge color={"blue"}>
                        {action.role === Role.Admin ? t("label.action-make-admin") : t("label.action-make-member")}
                    </Badge>
                );
            case "Deletion":
                return (
                    <Badge color={"zinc"}>
                        {action.mode === DeletionMode.Full
                            ? t("label.action-deletion-full")
                            : t("label.action-deletion")}
                    </Badge>
                );
            case "Rename":
                return (
                    <Badge color={"amber"}>{t("label.action-rename", { username: String(action.new_username) })}</Badge>
                );
        }
    }

    /**
     * The reason an Admin gave for an action, if it takes one
     *
     * @param action the entry's action
     * @returns the reason, empty when there is none
     */
    function reason(action: AdminLogAction) {
        return action.kind === "Lock" || action.kind === "Unlock" || action.kind === "Rename"
            ? (action.reason ?? "")
            : "";
    }

    return (
        <Table striped={true}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.time")}</TableHeader>
                    <TableHeader>{t("label.action")}</TableHeader>
                    {showAccount && <TableHeader>{t("label.account")}</TableHeader>}
                    <TableHeader className={"max-sm:hidden"}>{t("label.admin")}</TableHeader>
                    <TableHeader>{t("label.reason")}</TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {entries.map((entry) => (
                    <TableRow key={entry.uuid}>
                        <TableCell className={"whitespace-nowrap tabular-nums"}>
                            {formatDateTime(entry.created_at)}
                        </TableCell>
                        <TableCell>{badge(entry.action)}</TableCell>
                        {showAccount && (
                            <TableCell className={"font-medium"}>
                                {entry.account === null || entry.account === undefined ? (
                                    entry.account_username
                                ) : (
                                    <Link
                                        to={"/admin/accounts/$accountUuid"}
                                        params={{ accountUuid: entry.account }}
                                        className={"hover:text-(--color-accent) hover:underline"}
                                    >
                                        {entry.account_username}
                                    </Link>
                                )}
                            </TableCell>
                        )}
                        <TableCell className={"max-sm:hidden"}>{entry.admin_username}</TableCell>
                        <TableCell className={"whitespace-normal"}>
                            <Text>{reason(entry.action)}</Text>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
