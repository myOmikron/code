import {
    DescriptionDetails,
    DescriptionList,
    DescriptionTerm,
    Subheading,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Text,
} from "components";
import React from "react";
import { useTranslation } from "react-i18next";
import { SyncRunOutcome } from "src/api/generated";
import type { AdminSyncRun, AdminSyncRuns } from "src/api/generated";
import { AdminSyncOutcomeBadge } from "src/components/admin-sync-outcome-badge";
import { ChartCard } from "src/components/charts/chart-card";
import { SyncDurationChart } from "src/components/charts/sync-duration-chart";
import { formatDateTime, formatDuration } from "src/utils/format";

/** Start times on the chart axis: day and time, no year */
const TICK_FORMAT = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

/**
 * Format a start time for the chart axis
 *
 * @param iso the ISO timestamp
 *
 * @returns the day and time
 */
function formatTick(iso: string): string {
    return TICK_FORMAT.format(new Date(iso));
}

/**
 * The properties for {@link AdminSyncPanel}
 */
export type AdminSyncPanelProps = {
    /** The name of the sync */
    title: string;
    /** The file the sync last read, as description list rows, `null` before the first read */
    stamp: React.ReactNode | null;
    /** The Sync runs of the sync */
    runs: AdminSyncRuns;
};

/**
 * The state of one sync: its stamp, the last attempt, success and failure, and its recent runs.
 *
 * @returns the panel
 */
export function AdminSyncPanel({ title, stamp, runs }: AdminSyncPanelProps) {
    const [t] = useTranslation("admin");

    const outcomeLabels: Record<SyncRunOutcome, string> = {
        [SyncRunOutcome.Synced]: t("label.outcome-synced"),
        [SyncRunOutcome.Unchanged]: t("label.outcome-unchanged"),
        [SyncRunOutcome.Failed]: t("label.outcome-failed"),
    };
    const runSummary = (run: AdminSyncRun | null | undefined) =>
        run === null || run === undefined ? (
            <Text>{t("label.never")}</Text>
        ) : (
            <span className={"flex flex-wrap items-center gap-2"}>
                <span className={"text-zinc-950 dark:text-white"}>{formatDateTime(run.started_at)}</span>
                <AdminSyncOutcomeBadge outcome={run.outcome} />
            </span>
        );
    const oldestFirst = [...runs.recent].reverse();

    return (
        <section className={"flex flex-col gap-4"}>
            <Subheading>{title}</Subheading>

            <DescriptionList>
                {stamp ?? (
                    <>
                        <DescriptionTerm>{t("label.stamp")}</DescriptionTerm>
                        <DescriptionDetails>{t("label.never")}</DescriptionDetails>
                    </>
                )}
                <DescriptionTerm>{t("label.last-attempt")}</DescriptionTerm>
                <DescriptionDetails>{runSummary(runs.last_attempt)}</DescriptionDetails>
                <DescriptionTerm>{t("label.last-success")}</DescriptionTerm>
                <DescriptionDetails>{runSummary(runs.last_success)}</DescriptionDetails>
                <DescriptionTerm>{t("label.last-failure")}</DescriptionTerm>
                <DescriptionDetails>
                    {runs.last_failure === null || runs.last_failure === undefined ? (
                        <Text>{t("label.never")}</Text>
                    ) : (
                        <span className={"flex flex-col gap-1"}>
                            <span className={"text-zinc-950 dark:text-white"}>
                                {formatDateTime(runs.last_failure.started_at)}
                            </span>
                            <span className={"font-mono text-xs break-words text-red-700 dark:text-red-400"}>
                                {runs.last_failure.error}
                            </span>
                        </span>
                    )}
                </DescriptionDetails>
            </DescriptionList>

            {runs.recent.length === 0 ? (
                <Text>{t("description.no-runs")}</Text>
            ) : (
                <>
                    <ChartCard title={t("heading.run-durations")} hint={t("description.run-durations")} height={200}>
                        <SyncDurationChart
                            data={oldestFirst.map((run) => ({
                                started_at: run.started_at,
                                duration_ms: run.duration_ms,
                                outcome: outcomeLabels[run.outcome],
                            }))}
                            durationName={t("label.duration")}
                            formatTick={formatTick}
                            formatStart={formatDateTime}
                            formatDuration={formatDuration}
                        />
                    </ChartCard>

                    <Table striped={true} dense={true}>
                        <TableHead>
                            <TableRow>
                                <TableHeader>{t("label.started-at")}</TableHeader>
                                <TableHeader>{t("label.outcome")}</TableHeader>
                                <TableHeader className={"text-right"}>{t("label.duration")}</TableHeader>
                                <TableHeader className={"max-md:hidden"}>{t("label.error")}</TableHeader>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {runs.recent.map((run) => (
                                <TableRow key={run.uuid}>
                                    <TableCell>{formatDateTime(run.started_at)}</TableCell>
                                    <TableCell>
                                        <AdminSyncOutcomeBadge outcome={run.outcome} />
                                    </TableCell>
                                    <TableCell className={"text-right tabular-nums"}>
                                        {formatDuration(run.duration_ms)}
                                    </TableCell>
                                    <TableCell className={"max-w-md truncate max-md:hidden"} title={run.error ?? ""}>
                                        <Text>{run.error ?? ""}</Text>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}
        </section>
    );
}
