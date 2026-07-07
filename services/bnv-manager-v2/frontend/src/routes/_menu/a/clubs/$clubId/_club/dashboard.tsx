import { createFileRoute } from "@tanstack/react-router";
import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Api } from "src/api/api";
import { Text, Strong } from "src/components/base/text";
import { EnvelopeOpenIcon } from "@heroicons/react/24/outline";
import { UsersIcon, ShieldCheckIcon, EnvelopeIcon, GlobeAltIcon } from "@heroicons/react/20/solid";
import ADMIN_SINGLE_CLUB from "src/context/admin-single-club";

/**
 * The properties for {@link AdminClubDashboard}
 */
export type AdminClubDashboardProps = {};

/**
 * Format bytes into a human-readable string
 *
 * @param bytes The number of bytes to format
 * @returns A human-readable string like "1.2 GB"
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Dashboard for admins that show a single club
 */
export default function AdminClubDashboard(props: AdminClubDashboardProps) {
    const [t] = useTranslation("admin-club-view");

    const ctx = useContext(ADMIN_SINGLE_CLUB);
    const { pendingInvites, dashboardStats } = Route.useLoaderData();
    const { domains: domainStats, mailboxes: mailboxStats } = dashboardStats;

    return (
        <div className={"flex flex-col gap-8"}>
            <div className={"grid grid-cols-1 gap-4 sm:grid-cols-3"}>
                <StatCard
                    icon={<UsersIcon className={"size-5 text-blue-500"} />}
                    label={t("dashboard.members")}
                    value={ctx.data.member_count}
                />
                <StatCard
                    icon={<ShieldCheckIcon className={"size-5 text-emerald-500"} />}
                    label={t("dashboard.admins")}
                    value={ctx.data.admin_count}
                />
                <StatCard
                    icon={<EnvelopeIcon className={"size-5 text-amber-500"} />}
                    label={t("dashboard.pending-invites")}
                    value={pendingInvites.length}
                />
            </div>

            {domainStats.length > 0 && (
                <div className={"flex flex-col gap-4"}>
                    <Strong>{t("dashboard.domain-stats")}</Strong>
                    <div className={"flex flex-col gap-3"}>
                        {domainStats.map((d) => {
                            const storagePct = d.quota > 0 ? Math.min((d.bytes_used / d.quota) * 100, 100) : 0;
                            const storageColor =
                                storagePct > 90 ? "bg-red-500" : storagePct > 70 ? "bg-amber-500" : "bg-blue-500";
                            return (
                                <div
                                    key={d.domain}
                                    className={"rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"}
                                >
                                    <div className={"flex items-center gap-2"}>
                                        <GlobeAltIcon className={"size-4 text-zinc-400"} />
                                        <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                            {d.domain}
                                        </span>
                                    </div>
                                    <div className={"mt-3 grid grid-cols-2 gap-4"}>
                                        <div>
                                            <Text className={"!text-xs"}>{t("dashboard.storage-used")}</Text>
                                            <span className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                                                {formatBytes(d.bytes_used)}
                                                {d.quota > 0 && (
                                                    <span className={"font-normal text-zinc-400"}>
                                                        {" "}
                                                        / {formatBytes(d.quota)}
                                                    </span>
                                                )}
                                            </span>
                                            {d.quota > 0 && (
                                                <div
                                                    className={
                                                        "mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                                                    }
                                                >
                                                    <div
                                                        className={`h-full rounded-full ${storageColor}`}
                                                        style={{ width: `${storagePct}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <Text className={"!text-xs"}>{t("dashboard.mailboxes")}</Text>
                                            <span className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                                                {d.mailboxes_used}
                                                <span className={"font-normal text-zinc-400"}>
                                                    {" "}
                                                    / {d.mailboxes_max}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {mailboxStats.length > 0 && (
                <div className={"flex flex-col gap-4"}>
                    <Strong>{t("dashboard.mailbox-stats")}</Strong>
                    <div className={"flex flex-col gap-3"}>
                        {mailboxStats.map((m) => {
                            const hasQuota = m.quota > 0;
                            const pct = hasQuota ? Math.min((m.quota_used / m.quota) * 100, 100) : 0;
                            const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-blue-500";
                            return (
                                <div
                                    key={m.email}
                                    className={"rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"}
                                >
                                    <div className={"flex items-center justify-between"}>
                                        <div className={"flex items-center gap-2"}>
                                            <EnvelopeOpenIcon className={"size-4 text-zinc-400"} />
                                            <span className={"text-sm font-medium text-zinc-950 dark:text-white"}>
                                                {m.email}
                                            </span>
                                        </div>
                                        <div className={"flex items-center gap-3"}>
                                            <Text className={"!text-xs"}>
                                                {m.messages} {t("dashboard.messages")}
                                            </Text>
                                            <span className={"text-sm font-semibold text-zinc-950 dark:text-white"}>
                                                {formatBytes(m.quota_used)}
                                                <span className={"font-normal text-zinc-400"}>
                                                    {" "}
                                                    / {hasQuota ? formatBytes(m.quota) : t("dashboard.unlimited")}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                    {hasQuota && (
                                        <>
                                            <div
                                                className={
                                                    "mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                                                }
                                            >
                                                <div
                                                    className={`h-full rounded-full transition-all ${barColor}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <Text className={"mt-1 text-right !text-xs"}>{pct.toFixed(0)}%</Text>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * The properties for {@link StatCard}
 */
type StatCardProps = {
    /** The icon to display */
    icon: React.ReactNode;
    /** The label text */
    label: string;
    /** The numeric value */
    value: number;
};

/**
 * A card displaying a single stat with an icon
 */
function StatCard(props: StatCardProps) {
    return (
        <div className={"rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"}>
            <div className={"flex items-center gap-2"}>
                {props.icon}
                <Text>{props.label}</Text>
            </div>
            <div className={"mt-2 text-2xl font-semibold text-zinc-950 dark:text-white"}>{props.value}</div>
        </div>
    );
}

export const Route = createFileRoute("/_menu/a/clubs/$clubId/_club/dashboard")({
    component: AdminClubDashboard,
    loader: async ({ params }) => {
        const [pendingInvites, dashboardStats] = await Promise.all([
            Api.admin.clubs.invitedClubMembers(params.clubId),
            Api.admin.clubs.getDashboardStats(params.clubId),
        ]);
        return { pendingInvites, dashboardStats };
    },
});
