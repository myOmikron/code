import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components";
import { useTranslation } from "react-i18next";
import { BugReportState } from "src/api/generated";
import type { AdminBugReport } from "src/api/generated";
import { formatDateTime } from "src/utils/format";

/**
 * The properties for {@link AdminBugReportTable}
 */
export type AdminBugReportTableProps = {
    /** The Bug reports, newest first */
    reports: Array<AdminBugReport>;
};

/**
 * Bug reports with number, reporter, time, route and Release, each row linking to its detail page
 *
 * @returns the table
 */
export function AdminBugReportTable({ reports }: AdminBugReportTableProps) {
    const [t] = useTranslation("admin");

    return (
        <Table striped={true}>
            <TableHead>
                <TableRow>
                    <TableHeader>{t("label.bug-report-number")}</TableHeader>
                    <TableHeader>{t("label.time")}</TableHeader>
                    <TableHeader>{t("label.bug-report-reporter")}</TableHeader>
                    <TableHeader className={"max-sm:hidden"}>{t("label.bug-report-route")}</TableHeader>
                    <TableHeader className={"max-sm:hidden"}>{t("label.bug-report-release")}</TableHeader>
                    <TableHeader>{t("label.bug-report-state")}</TableHeader>
                </TableRow>
            </TableHead>
            <TableBody>
                {reports.map((report) => (
                    <TableRow
                        key={report.number}
                        href={"/admin/bug-reports/$number"}
                        params={{ number: String(report.number) }}
                        title={`#${report.number}`}
                    >
                        <TableCell className={"font-medium tabular-nums"}>#{report.number}</TableCell>
                        <TableCell className={"whitespace-nowrap tabular-nums"}>
                            {formatDateTime(report.created_at)}
                        </TableCell>
                        <TableCell>{report.reporter.username}</TableCell>
                        <TableCell className={"max-w-64 truncate max-sm:hidden"}>{report.route}</TableCell>
                        <TableCell className={"tabular-nums max-sm:hidden"}>{report.release}</TableCell>
                        <TableCell>
                            {report.state === BugReportState.Done ? (
                                <Badge color={"green"}>{t("label.bug-report-done")}</Badge>
                            ) : (
                                <Badge color={"amber"}>{t("label.bug-report-open")}</Badge>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
